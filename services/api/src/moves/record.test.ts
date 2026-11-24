import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, disposals, instruments, lots, positions, tokens, users, wallets } from "../db/schema.js";
import { recordMove, type MoveRecord } from "./record.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";
const STARTED = new Date("2026-11-20T10:00:00.000Z");
const LANDED = new Date("2026-11-20T10:00:30.000Z");

/** A person with a Mercury wallet and a linked Phantom holding 2 NVDAx, as position-sync last wrote it. */
const seed = async (position?: Partial<typeof positions.$inferInsert> | null) => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:move" }).returning();
  const userId = user!.id;
  const mercury = await mercuryWallet(db, userId);
  const [linked] = await db
    .insert(wallets)
    .values({
      userId,
      address: "PhAntomWa11etAddre55xxxxxxxxxxxxxxxxxxxxxxx",
      kind: "external",
      isPrimary: false,
      label: "Phantom main",
      linkedAt: new Date("2026-11-01T00:00:00.000Z"),
    })
    .returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  if (position !== null)
    await db.insert(positions).values({
      userId,
      walletId: linked!.id,
      instrumentId: instrument!.id,
      shares: "2",
      sharesWithBasis: "2",
      costBasisUsd: "300",
      referenceBasisUsd: "296",
      avgUnitCostUsd: "150",
      ...position,
    });
  const input = (over: Partial<MoveRecord> = {}): MoveRecord => ({
    userId,
    fromWalletId: linked!.id,
    toWalletId: mercury,
    signature: SIG,
    occurredAt: LANDED,
    startedAt: STARTED,
    moved: [{ mint: NVDAX, amountRaw: 100_000_000n }],
    ...over,
  });
  return { db, userId, mercury, linked: linked!.id, instrumentId: instrument!.id, tokenId: token!.id, input };
};

type Seeded = Awaited<ReturnType<typeof seed>>;
/** Postgres hands numerics back at their full scale; read as the numbers they are. */
const plain = <T extends object>(row: T): T =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /^-?\d+\.\d+$/.test(v) ? D(v).toFixed() : v,
    ]),
  ) as T;
const lotsIn = async (s: Seeded, walletId: string) =>
  (await s.db.select().from(lots).where(eq(lots.walletId, walletId))).map(plain);
const outsOf = async (s: Seeded) =>
  (await s.db.select().from(disposals).where(eq(disposals.walletId, s.linked))).map(plain);
const feedOf = (s: Seeded, walletId: string) =>
  s.db.select().from(activities).where(eq(activities.walletId, walletId));

describe("recordMove", () => {
  it("carries the moved shares into the Mercury wallet at the cost they had in the linked one", async () => {
    const s = await seed();
    expect(await recordMove(s.db, s.input())).toEqual({ written: true });

    const [lot] = await lotsIn(s, s.mercury);
    expect(lot).toMatchObject({
      tokenId: s.tokenId,
      tokenQty: 100_000_000n,
      shares: "1",
      unitCostUsd: "150",
      feeUsd: "0",
      referencePriceUsd: "148",
      acquiredAt: LANDED,
      source: "transfer_in",
      isEstimated: false,
      estimateSource: null,
    });
    // And they leave the linked wallet once, as a transfer: not a sale.
    const outs = await outsOf(s);
    expect(outs).toHaveLength(1);
    expect(outs[0]).toMatchObject({ kind: "transfer_out", tokenQty: 100_000_000n, shares: "1" });
  });

  it("says where it went and where it came from, in each wallet's feed", async () => {
    const s = await seed();
    await recordMove(s.db, s.input());
    expect((await feedOf(s, s.linked)).map((a) => [a.kind, a.title])).toEqual([
      ["transfer_out", "Moved to your Mercury wallet"],
    ]);
    expect((await feedOf(s, s.mercury)).map((a) => [a.kind, a.title])).toEqual([
      ["transfer_in", "Moved from Phantom main"],
    ]);
  });

  it("names an unlabelled wallet by its short address", async () => {
    const s = await seed();
    await s.db.update(wallets).set({ label: null }).where(eq(wallets.id, s.linked));
    await recordMove(s.db, s.input());
    expect((await feedOf(s, s.mercury))[0]!.title).toBe("Moved from PhAn…xxxx");
  });

  it("keeps an estimated cost estimated, saying it came from the person's own wallet", async () => {
    const s = await seed({ estimatedCostUsd: "300" });
    await recordMove(s.db, s.input());
    const [lot] = await lotsIn(s, s.mercury);
    expect(lot).toMatchObject({ isEstimated: true, estimateSource: "own_wallet", unitCostUsd: "150" });
  });

  it("carries a cost only for the share of the move the linked wallet had one for", async () => {
    // 2 held, 1 with a cost: half of what moves arrives with that cost, the rest with none.
    const s = await seed({ sharesWithBasis: "1", costBasisUsd: "150", referenceBasisUsd: "140" });
    await recordMove(s.db, s.input());
    const [lot] = await lotsIn(s, s.mercury);
    expect(lot).toMatchObject({
      tokenQty: 50_000_000n,
      shares: "0.5",
      unitCostUsd: "150",
      referencePriceUsd: "140",
    });
    // The whole amount still leaves the linked wallet.
    expect((await outsOf(s))[0]!.tokenQty).toBe(100_000_000n);
  });

  it("writes no lot when the linked wallet had no cost for them, so none is invented", async () => {
    const s = await seed({
      sharesWithBasis: "0",
      costBasisUsd: "0",
      referenceBasisUsd: "0",
      avgUnitCostUsd: "0",
    });
    await recordMove(s.db, s.input());
    expect(await lotsIn(s, s.mercury)).toEqual([]);
    expect(await outsOf(s)).toHaveLength(1);
  });

  it("writes no lot when the linked wallet has no position read for the stock yet", async () => {
    const s = await seed(null);
    await recordMove(s.db, s.input());
    expect(await lotsIn(s, s.mercury)).toEqual([]);
    expect(await outsOf(s)).toHaveLength(1);
  });

  it("takes back the departure position-sync wrote for this move, so the shares leave once", async () => {
    const s = await seed();
    const early = { userId: s.userId, walletId: s.linked, tokenId: s.tokenId, instrumentId: s.instrumentId };
    await s.db.insert(disposals).values([
      // Seen by position-sync after the move was built: this move, early.
      { ...early, tokenQty: 100_000_000n, shares: "1", kind: "transfer_out", occurredAt: LANDED },
      // From before: a different departure, kept.
      {
        ...early,
        tokenQty: 7n,
        shares: "0.00000007",
        kind: "transfer_out",
        occurredAt: new Date("2026-11-01T00:00:00.000Z"),
        recordedAt: new Date("2026-11-01T00:00:00.000Z"),
      },
    ]);
    await recordMove(s.db, s.input());
    const outs = await outsOf(s);
    expect(outs.map((d) => d.tokenQty).sort()).toEqual([100_000_000n, 7n].sort());
  });

  it("writes nothing the second time for the same signature", async () => {
    const s = await seed();
    await recordMove(s.db, s.input());
    expect(await recordMove(s.db, s.input())).toEqual({ written: false });
    expect(await lotsIn(s, s.mercury)).toHaveLength(1);
    expect(await outsOf(s)).toHaveLength(1);
    expect(await feedOf(s, s.mercury)).toHaveLength(1);
  });

  it("gives USDC its feed rows and no lot, and skips a zero amount", async () => {
    const s = await seed();
    await recordMove(
      s.db,
      s.input({
        moved: [
          { mint: USDC, amountRaw: 19_550_000n },
          { mint: NVDAX, amountRaw: 0n },
        ],
      }),
    );
    expect(await lotsIn(s, s.mercury)).toEqual([]);
    expect(await outsOf(s)).toEqual([]);
    const feed = await s.db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, s.userId), eq(activities.txSignature, SIG)));
    expect(feed.map((a) => [a.kind, a.mint]).sort()).toEqual(
      [
        ["transfer_in", USDC],
        ["transfer_out", USDC],
      ].sort(),
    );
  });

  it("does nothing for an empty move", async () => {
    const s = await seed();
    expect(await recordMove(s.db, s.input({ moved: [] }))).toEqual({ written: false });
  });
});
