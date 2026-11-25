import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  activities,
  disposals,
  historyJobs,
  instruments,
  lots,
  positions,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import { recordMove, type MoveRecord } from "./record.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";
const STARTED = new Date("2026-11-20T10:00:00.000Z");
const LANDED = new Date("2026-11-20T10:00:30.000Z");
const LONG_AGO = new Date("2026-09-01T00:00:00.000Z");

type LotSeed = {
  tokenQty: bigint;
  shares: string;
  unitCostUsd: string;
  referencePriceUsd?: string;
  isEstimated?: boolean;
};
const TWO_AT_150: readonly LotSeed[] = [
  { tokenQty: 200_000_000n, shares: "2", unitCostUsd: "150", referencePriceUsd: "148" },
];

/** A person with a Mercury wallet and a linked Phantom, whose lots say what it paid for its NVDAx. */
const seed = async (held: readonly LotSeed[] = TWO_AT_150) => {
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
  for (const l of held)
    await db.insert(lots).values({
      userId,
      walletId: linked!.id,
      tokenId: token!.id,
      instrumentId: instrument!.id,
      tokenQty: l.tokenQty,
      shares: l.shares,
      unitCostUsd: l.unitCostUsd,
      referencePriceUsd: l.referencePriceUsd ?? null,
      acquiredAt: LONG_AGO,
      recordedAt: LONG_AGO,
      source: "chain",
      isEstimated: l.isEstimated ?? false,
    });
  const input = (over: Partial<MoveRecord> = {}): MoveRecord => ({
    userId,
    fromWalletId: linked!.id,
    toWalletId: mercury,
    signature: SIG,
    occurredAt: LANDED,
    startedAt: STARTED,
    moved: [{ mint: NVDAX, amountRaw: 100_000_000n }],
    usdcMint: USDC,
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
const feedOf = async (s: Seeded, walletId: string) =>
  (await s.db.select().from(activities).where(eq(activities.walletId, walletId))).map(plain);
const departure = (s: Seeded, tokenQty: bigint, over: Partial<typeof disposals.$inferInsert> = {}) =>
  s.db.insert(disposals).values({
    userId: s.userId,
    walletId: s.linked,
    tokenId: s.tokenId,
    instrumentId: s.instrumentId,
    tokenQty,
    shares: D(tokenQty.toString()).div(1e8).toFixed(),
    kind: "transfer_out",
    occurredAt: LANDED,
    ...over,
  });

describe("recordMove", () => {
  it("carries the moved shares into the Mercury wallet at the cost the linked wallet's lots say", async () => {
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

  it("averages the cost over every open lot, as the linked wallet's own figures do", async () => {
    const s = await seed([
      { tokenQty: 100_000_000n, shares: "1", unitCostUsd: "100" },
      { tokenQty: 100_000_000n, shares: "1", unitCostUsd: "200" },
    ]);
    await recordMove(s.db, s.input());
    expect((await lotsIn(s, s.mercury))[0]).toMatchObject({ unitCostUsd: "150", referencePriceUsd: "150" });
  });

  it("still carries the cost when position-sync has already seen everything leave and emptied the position", async () => {
    // The sheet moves everything by default. Position-sync got there first: a young transfer out, an empty position.
    const s = await seed();
    await departure(s, 200_000_000n);
    await s.db.insert(positions).values({
      userId: s.userId,
      walletId: s.linked,
      instrumentId: s.instrumentId,
      shares: "0",
      costBasisUsd: "0",
      avgUnitCostUsd: "0",
    });
    await recordMove(s.db, s.input({ moved: [{ mint: NVDAX, amountRaw: 200_000_000n }] }));

    expect((await lotsIn(s, s.mercury))[0]).toMatchObject({ tokenQty: 200_000_000n, unitCostUsd: "150" });
    // Position-sync's departure was this move, early: taken back, so the shares leave once.
    expect((await outsOf(s)).map((d) => d.tokenQty)).toEqual([200_000_000n]);
  });

  it("keeps a departure from before the move, which was something else, and reads the cost after it", async () => {
    const s = await seed();
    await departure(s, 50_000_000n, {
      occurredAt: LONG_AGO,
      recordedAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    await recordMove(s.db, s.input());
    expect((await outsOf(s)).map((d) => d.tokenQty).sort()).toEqual([100_000_000n, 50_000_000n].sort());
    expect((await lotsIn(s, s.mercury))[0]).toMatchObject({ tokenQty: 100_000_000n, unitCostUsd: "150" });
  });

  it("keeps an estimated cost estimated, saying it came from the person's own wallet", async () => {
    const s = await seed([{ tokenQty: 200_000_000n, shares: "2", unitCostUsd: "150", isEstimated: true }]);
    await recordMove(s.db, s.input());
    expect((await lotsIn(s, s.mercury))[0]).toMatchObject({
      isEstimated: true,
      estimateSource: "own_wallet",
      unitCostUsd: "150",
    });
  });

  it("carries a cost only for the shares that had one: those leave first, the rest arrive with none", async () => {
    // 0.5 shares have a cost on record; more were held. A move of 1 carries the cost of 0.5.
    const s = await seed([{ tokenQty: 50_000_000n, shares: "0.5", unitCostUsd: "140" }]);
    await recordMove(s.db, s.input());
    expect((await lotsIn(s, s.mercury))[0]).toMatchObject({
      tokenQty: 50_000_000n,
      shares: "0.5",
      unitCostUsd: "140",
    });
    // The whole amount still leaves the linked wallet.
    expect((await outsOf(s))[0]!.tokenQty).toBe(100_000_000n);
  });

  it("writes no lot when the linked wallet has no cost on record, so none is invented", async () => {
    const s = await seed([]);
    await recordMove(s.db, s.input());
    expect(await lotsIn(s, s.mercury)).toEqual([]);
    expect(await outsOf(s)).toHaveLength(1);
  });

  it("says where it went and where it came from, in each wallet's feed", async () => {
    const s = await seed();
    await recordMove(s.db, s.input());
    expect((await feedOf(s, s.linked)).map((a) => [a.kind, a.title, a.amountUsd])).toEqual([
      ["transfer_out", "Moved to your Mercury wallet", null],
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

  it("writes nothing the second time for the same signature", async () => {
    const s = await seed();
    await recordMove(s.db, s.input());
    expect(await recordMove(s.db, s.input())).toEqual({ written: false });
    expect(await lotsIn(s, s.mercury)).toHaveLength(1);
    expect(await outsOf(s)).toHaveLength(1);
    expect(await feedOf(s, s.mercury)).toHaveLength(1);
  });

  it("gives USDC its dollars on both sides, so a move cancels out across every wallet, and no lot", async () => {
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
    const feed = (
      await s.db
        .select()
        .from(activities)
        .where(and(eq(activities.userId, s.userId), eq(activities.txSignature, SIG)))
    ).map(plain);
    expect(feed.map((a) => [a.kind, a.mint, a.amountUsd]).sort()).toEqual(
      [
        ["transfer_in", USDC, "19.55"],
        ["transfer_out", USDC, "19.55"],
      ].sort(),
    );
  });

  it("carries every share of a token held in two accounts and moved from both in one transaction", async () => {
    // `planMove` takes a mint from each account the wallet holds it in: one signature, the mint twice.
    const s = await seed([{ tokenQty: 300_000_000n, shares: "3", unitCostUsd: "150" }]);
    await recordMove(
      s.db,
      s.input({
        moved: [
          { mint: NVDAX, amountRaw: 200_000_000n },
          { mint: NVDAX, amountRaw: 100_000_000n },
          { mint: USDC, amountRaw: 5_000_000n },
          { mint: USDC, amountRaw: 2_500_000n },
        ],
      }),
    );

    const lots = await lotsIn(s, s.mercury);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ tokenQty: 300_000_000n, shares: "3", unitCostUsd: "150" });
    const outs = await outsOf(s);
    expect(outs).toHaveLength(1);
    expect(outs[0]).toMatchObject({ kind: "transfer_out", tokenQty: 300_000_000n, shares: "3" });
    // The dollars of both USDC accounts, on both sides.
    const usdc = (await feedOf(s, s.mercury)).filter((a) => a.mint === USDC);
    expect(usdc.map((a) => a.amountUsd)).toEqual(["7.5"]);
  });

  it("leaves a move from a wallet whose past is still being read to the cost pass, which carries it with its cost", async () => {
    for (const status of ["queued", "running", "read"] as const) {
      const s = await seed();
      await s.db.insert(historyJobs).values({ walletId: s.linked, userId: s.userId, status });
      expect(await recordMove(s.db, s.input()), status).toEqual({ written: false, deferred: true });
      expect(await feedOf(s, s.linked)).toEqual([]);
    }
  });

  it("records now once the past is read, or when reading it failed for good", async () => {
    for (const status of ["done", "failed"] as const) {
      const s = await seed();
      await s.db.insert(historyJobs).values({ walletId: s.linked, userId: s.userId, status });
      expect(await recordMove(s.db, s.input()), status).toEqual({ written: true });
    }
  });

  it("does nothing for an empty move", async () => {
    const s = await seed();
    expect(await recordMove(s.db, s.input({ moved: [] }))).toEqual({ written: false });
  });
});
