import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { D, replayPosition, type Decimal } from "@mercury/core";
import { movementsByToken } from "../portfolio/open.js";
import type { PastPriceSource, PriceBoard } from "@mercury/market";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  activities,
  disposals,
  earnEvents,
  historyEvents,
  historyJobs,
  historyTxs,
  instruments,
  lots,
  multiplierEvents,
  notifications,
  positions,
  priceBars,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import { costWallet, walletToCost } from "./cost.js";
import { rawJson } from "./events.js";
import { pgEarnLedger } from "../earn/store.js";
import { SOL_MINT } from "./events.js";

const ME = "Phantom1111111111111111111111111111111111111";
const MAIN = "Mercury11111111111111111111111111111111111111";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NOW = new Date("2026-11-24T12:00:00.000Z");
const LINKED = new Date("2026-11-20T00:00:00.000Z");
const day = (n: number) => new Date(Date.UTC(2026, 5, n));
/** TSLAx has 8 decimals: a whole token is 100,000,000. */
const tokensOf = (n: number) => BigInt(Math.round(n * 1e8));

/** A historical source that answers from a table, and records what it was asked. */
const pastOf = (prices: Record<string, number | "fail">) => {
  const asked: string[] = [];
  const past: PastPriceSource = {
    priceAt: async (symbol, at) => {
      asked.push(`${symbol}@${at.toISOString()}`);
      const p = prices[`${symbol}@${at.toISOString()}`] ?? prices[symbol];
      if (p === "fail") throw new Error("yahoo chart returned 503");
      return p === undefined ? null : D(p);
    },
  };
  return { past, asked };
};

const boardOf = (pricePerShare: Decimal | null): PriceBoard => ({
  pricesFor: async (mints) =>
    new Map(
      mints.map((mint) => [
        mint,
        {
          mint,
          usdPricePerToken: pricePerShare ?? D(0),
          pricePerShare,
          changePct24h: null,
          liquidityUsd: D(0),
          multiplier: D(1),
          observedAt: null,
        },
      ]),
    ),
});

const seed = async (status: "read" | "done" = "read") => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:cost" }).returning();
  const userId = user!.id;
  const mainId = await mercuryWallet(db, userId, MAIN);
  const [w] = await db
    .insert(wallets)
    .values({ userId, address: ME, kind: "external", isPrimary: false, linkedAt: LINKED })
    .returning();
  const walletId = w!.id;
  const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 })
    .returning();
  await db.insert(historyJobs).values({ walletId, userId, status });

  let n = 0;
  /** One movement found in history, with the transaction it came from kept raw. */
  const found = async (e: {
    kind: "in" | "out" | "loan_deposit" | "loan_withdraw";
    amount: bigint;
    at: Date;
    mint?: string;
    counterMint?: string;
    counterAmount?: bigint;
    sourceOwner?: string;
    destinationOwner?: string;
    preRaw?: bigint;
    costed?: boolean;
  }) => {
    const signature = `Sig${++n}`;
    const mint = e.mint ?? TSLAX;
    await db.insert(historyTxs).values({
      signature,
      slot: BigInt(n),
      blockTime: e.at,
      raw: { preTokens: e.preRaw === undefined ? [] : [{ owner: ME, mint, rawAmount: e.preRaw.toString() }] },
    });
    await db.insert(historyEvents).values({
      walletId,
      account: `${mint}-acct`,
      signature,
      blockTime: e.at,
      kind: e.kind,
      mint,
      amountRaw: e.amount,
      counterMint: e.counterMint ?? null,
      counterAmountRaw: e.counterAmount ?? null,
      sourceOwner: e.sourceOwner ?? null,
      destinationOwner: e.destinationOwner ?? null,
      costedAt: e.costed === true ? NOW : null,
    });
  };
  const chainLots = () =>
    db
      .select()
      .from(lots)
      .where(and(eq(lots.walletId, walletId), eq(lots.source, "chain")));
  const job = async () => (await db.select().from(historyJobs).where(eq(historyJobs.walletId, walletId)))[0]!;
  return {
    db,
    userId,
    walletId,
    mainId,
    tokenId: token!.id,
    instrumentId: instrument!.id,
    found,
    chainLots,
    job,
  };
};

/** The Mercury wallet's lots, and both wallets' feed rows for a signature. */
const mercurySide = async (s: Awaited<ReturnType<typeof seed>>) =>
  s.db.select().from(lots).where(eq(lots.walletId, s.mainId));
const feedFor = async (s: Awaited<ReturnType<typeof seed>>, signature: string) =>
  (await s.db.select().from(activities).where(eq(activities.txSignature, signature)))
    .map((a) => [a.walletId === s.mainId ? "mercury" : "linked", a.kind, a.title])
    .sort();

const deps = (db: Awaited<ReturnType<typeof seed>>["db"], past: PastPriceSource, extra = {}) => ({
  db,
  past,
  board: boardOf(null),
  ...extra,
});

describe("costWallet, a first costing", () => {
  it("costs a swap for USDC exactly, and marks the wallet ready", async () => {
    const s = await seed();
    // 2 shares for $600 of USDC: $300 each.
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(1),
      counterMint: USDC,
      counterAmount: 600_000_000n,
    });

    const r = await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);

    expect(r).toMatchObject({ lots: 1, costed: 1, ready: true });
    const [lot] = await s.chainLots();
    expect(lot).toMatchObject({
      tokenQty: tokensOf(2),
      isEstimated: false,
      estimateSource: null,
      acquiredAt: day(1),
      recordedAt: NOW,
    });
    expect(D(lot!.feeUsd).isZero()).toBe(true);
    expect(D(lot!.unitCostUsd).toString()).toBe("300");
    expect(D(lot!.shares).toString()).toBe("2");
    expect((await s.job()).status).toBe("done");
    const left = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(left.every((e) => e.costedAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it("estimates a plain transfer in at the share's price then, and says so", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(2), sourceOwner: "Exchange111" });
    const { past, asked } = pastOf({ [`TSLA@${day(2).toISOString()}`]: 250 });

    await costWallet(deps(s.db, past), s.walletId, NOW);

    const [lot] = await s.chainLots();
    expect(lot).toMatchObject({ isEstimated: true, estimateSource: "market_price" });
    expect(D(lot!.unitCostUsd).toString()).toBe("250");
    expect(D(lot!.referencePriceUsd!).toString()).toBe("250");
    expect(asked).toEqual([`TSLA@${day(2).toISOString()}`]);
  });

  it("prices a swap paid in SOL at SOL's price then", async () => {
    const s = await seed();
    // 2 SOL for 1 share, SOL at $150: $300.
    await s.found({
      kind: "in",
      amount: tokensOf(1),
      at: day(3),
      counterMint: SOL_MINT,
      counterAmount: 2_000_000_000n,
    });
    await costWallet(deps(s.db, pastOf({ "SOL-USD": 150 }).past), s.walletId, NOW);
    const [lot] = await s.chainLots();
    expect(lot).toMatchObject({ isEstimated: true, estimateSource: "sol_price" });
    expect(D(lot!.unitCostUsd).toString()).toBe("300");
  });

  it("keeps the cost shares had in the person's own wallet when they moved from it", async () => {
    const s = await seed();
    await s.db.insert(positions).values({
      userId: s.userId,
      walletId: s.mainId,
      instrumentId: s.instrumentId,
      shares: "1",
      sharesWithBasis: "1",
      costBasisUsd: "180",
      referenceBasisUsd: "180",
      feeUsd: "0",
      avgUnitCostUsd: "180",
    });
    await s.found({ kind: "in", amount: tokensOf(1), at: day(4), sourceOwner: MAIN });
    const { past, asked } = pastOf({ TSLA: 999 });
    await costWallet(deps(s.db, past), s.walletId, NOW);
    const [lot] = await s.chainLots();
    expect(lot).toMatchObject({ estimateSource: "own_wallet" });
    expect(D(lot!.unitCostUsd).toString()).toBe("180");
    expect(asked).toEqual([]);
  });

  it("replays departures at average cost, writing only what is still held", async () => {
    const s = await seed();
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(1),
      counterMint: USDC,
      counterAmount: 200_000_000n,
    });
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(2),
      counterMint: USDC,
      counterAmount: 600_000_000n,
    });
    await s.found({ kind: "out", amount: tokensOf(2), at: day(3) });
    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    const held = await s.chainLots();
    expect(held.reduce((t, l) => t + l.tokenQty, 0n)).toBe(tokensOf(2));
    const cost = held.reduce((t, l) => t.add(D(l.shares).mul(D(l.unitCostUsd))), D(0));
    expect(cost.toString()).toBe("400");
  });

  it("falls back to Mercury's earliest price, then the link-day price, then today's", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(5), sourceOwner: "Exchange111" });
    await s.db.insert(priceBars).values({
      tokenId: s.tokenId,
      width: "1d",
      bucketStart: new Date("2026-10-01T00:00:00.000Z"),
      marketOpen: "1",
      marketHigh: "1",
      marketLow: "1",
      marketClose: "201",
      referenceClose: "200",
      multiplier: "1",
      liquidityUsd: "0",
      samples: 1,
      firstAt: new Date("2026-10-01T00:00:00.000Z"),
      lastAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    const [lot] = await s.chainLots();
    expect(lot).toMatchObject({ estimateSource: "earliest_price" });
    expect(D(lot!.unitCostUsd).toString()).toBe("200");
  });

  it("takes today's price as the last resort, so every share ends with a cost", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(5), sourceOwner: "Exchange111" });
    await costWallet({ ...deps(s.db, pastOf({}).past), board: boardOf(D(321)) }, s.walletId, NOW);
    const [lot] = await s.chainLots();
    expect(lot).toMatchObject({ estimateSource: "link_day_price" });
    expect(D(lot!.unitCostUsd).toString()).toBe("321");
  });

  it("writes nothing, and stays calculating, when the price source fails: it waits for it", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(5), sourceOwner: "Exchange111" });
    await expect(costWallet(deps(s.db, pastOf({ TSLA: "fail" }).past), s.walletId, NOW)).rejects.toThrow(
      "503",
    );
    expect(await s.chainLots()).toEqual([]);
    expect((await s.job()).status).toBe("read");
    const [e] = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(e!.costedAt).toBeNull();
  });

  it("gives up on the failing source after repeated failures, for Mercury's own prices", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(5), sourceOwner: "Exchange111" });
    const { past, asked } = pastOf({ TSLA: "fail" });
    await costWallet({ ...deps(s.db, past, { skipPast: true }), board: boardOf(D(99)) }, s.walletId, NOW);
    expect(asked).toEqual([]);
    expect((await s.chainLots())[0]).toMatchObject({ estimateSource: "link_day_price" });
  });

  it("credits the dividends held lots earned since, dated and found in history, never as news", async () => {
    const s = await seed();
    await s.found({
      kind: "in",
      amount: tokensOf(100),
      at: day(1),
      counterMint: USDC,
      counterAmount: 10_000_000_000n,
    });
    await s.db.insert(multiplierEvents).values({
      tokenId: s.tokenId,
      oldMultiplier: "1",
      newMultiplier: "1.01",
      observedAt: day(10),
      kind: "dividend",
    });
    await s.db.update(tokens).set({ multiplier: "1.01" }).where(eq(tokens.id, s.tokenId));

    const r = await costWallet(deps(s.db, pastOf({ TSLA: 110 }).past), s.walletId, NOW);

    expect(r.dividends).toBe(1);
    const paid = await s.db
      .select()
      .from(lots)
      .where(and(eq(lots.walletId, s.walletId), eq(lots.source, "dividend")));
    expect(paid.map((l) => [D(l.shares).toString(), l.acquiredAt, l.tokenQty])).toEqual([["1", day(10), 0n]]);
    const [row] = await s.db.select().from(activities).where(eq(activities.walletId, s.walletId));
    expect(row).toMatchObject({ kind: "dividend", occurredAt: day(10), title: "TSLA dividend" });
    expect(D(row!.amountUsd!).toString()).toBe("110");
    expect(await s.db.select().from(notifications)).toEqual([]);
  });

  it("prices what was held before the oldest movement read, where the walk stopped at its cap", async () => {
    const s = await seed();
    await s.found({ kind: "out", amount: tokensOf(1), at: day(6), preRaw: tokensOf(3) });
    await costWallet(deps(s.db, pastOf({ TSLA: 50 }).past), s.walletId, NOW);
    const held = await s.chainLots();
    expect(held.map((l) => [l.tokenQty, l.estimateSource])).toEqual([[tokensOf(2), "market_price"]]);
  });

  it("prices what was pledged to Kamino before the oldest movement read, with the wallet's own", async () => {
    const s = await seed();
    await s.db
      .update(historyJobs)
      .set({ openingPledged: { [`${TSLAX}-acct`]: tokensOf(2).toString() } })
      .where(eq(historyJobs.walletId, s.walletId));
    await s.found({ kind: "out", amount: tokensOf(1), at: day(6), preRaw: tokensOf(3) });
    await costWallet(deps(s.db, pastOf({ TSLA: 50 }).past), s.walletId, NOW);
    const held = await s.chainLots();
    // 3 in the wallet and 2 in the loan before it; 1 left.
    expect(held.map((l) => [l.tokenQty, l.estimateSource])).toEqual([[tokensOf(4), "market_price"]]);
  });

  it("keeps shares pledged to Kamino at the cost they were bought at: a pledge sells nothing", async () => {
    const s = await seed();
    // Bought 10 at $200, pledged 8, took 8 back.
    await s.found({
      kind: "in",
      amount: tokensOf(10),
      at: day(1),
      counterMint: USDC,
      counterAmount: 2_000_000_000n,
    });
    await s.found({ kind: "loan_deposit", amount: tokensOf(8), at: day(2) });
    await s.found({ kind: "loan_withdraw", amount: tokensOf(8), at: day(3) });
    const { past, asked } = pastOf({ TSLA: 250 });

    const r = await costWallet(deps(s.db, past), s.walletId, NOW);

    expect(r).toMatchObject({ lots: 1, costed: 3, ready: true });
    const held = await s.chainLots();
    expect(held.map((l) => [l.tokenQty, D(l.unitCostUsd).toString(), l.isEstimated])).toEqual([
      [tokensOf(10), "200", false],
    ]);
    // Nothing came back as a new arrival to be priced.
    expect(asked).toEqual([]);
  });

  it("keeps a holding pledged in full at its cost", async () => {
    const s = await seed();
    await s.found({
      kind: "in",
      amount: tokensOf(10),
      at: day(1),
      counterMint: USDC,
      counterAmount: 2_000_000_000n,
    });
    await s.found({ kind: "loan_deposit", amount: tokensOf(10), at: day(2) });
    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    const held = await s.chainLots();
    expect(held.map((l) => [l.tokenQty, D(l.unitCostUsd).toString()])).toEqual([[tokensOf(10), "200"]]);
  });

  it("marks USDC and other movements costed without writing lots for them", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: 5_000_000n, at: day(1), mint: USDC });
    const r = await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    expect(r).toMatchObject({ lots: 0, costed: 1, ready: true });
    expect((await s.job()).status).toBe("done");
  });
});

describe("costWallet, a later costing", () => {
  it("prices new arrivals, takes departures out in their place, and keeps the wallet ready", async () => {
    const s = await seed("done");
    await s.found({
      kind: "in",
      amount: tokensOf(1),
      at: day(1),
      counterMint: USDC,
      counterAmount: 100_000_000n,
      costed: true,
    });
    await s.found({
      kind: "in",
      amount: tokensOf(1),
      at: day(8),
      counterMint: USDC,
      counterAmount: 300_000_000n,
    });
    await s.found({ kind: "out", amount: tokensOf(1), at: day(9) });

    const r = await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);

    expect(r).toMatchObject({ lots: 1, costed: 2, ready: false });
    const [lot] = await s.chainLots();
    expect(D(lot!.unitCostUsd).toString()).toBe("300");
    expect(lot!.tokenQty).toBe(tokensOf(1));
    const gone = await s.db.select().from(disposals).where(eq(disposals.walletId, s.walletId));
    expect(gone.map((d) => [d.kind, d.tokenQty, d.occurredAt, d.realisedPnlUsd])).toEqual([
      ["chain", tokensOf(1), day(9), null],
    ]);
    expect((await s.job()).status).toBe("done");
  });

  describe("a sale and a buy back, outside Mercury", () => {
    /** 10 TSLAx at $100, already in the wallet's records from its first costing. */
    const holding = async () => {
      const s = await seed("done");
      await s.db.insert(lots).values({
        userId: s.userId,
        walletId: s.walletId,
        tokenId: s.tokenId,
        instrumentId: s.instrumentId,
        tokenQty: tokensOf(10),
        shares: "10",
        unitCostUsd: "100",
        feeUsd: "0",
        acquiredAt: day(1),
        recordedAt: new Date(NOW.getTime() - 86_400_000),
        source: "chain",
      });
      // The purchase they came from, costed on the first pass.
      await s.found({
        kind: "in",
        amount: tokensOf(10),
        at: day(1),
        counterMint: USDC,
        counterAmount: 1_000_000_000n,
        costed: true,
      });
      return s;
    };
    /** What the records hold now, replayed as position-sync replays them. */
    const held = async (s: Awaited<ReturnType<typeof seed>>) => {
      const [l, d] = await Promise.all([
        s.db.select().from(lots).where(eq(lots.walletId, s.walletId)),
        s.db.select().from(disposals).where(eq(disposals.walletId, s.walletId)),
      ]);
      const open = replayPosition(
        movementsByToken(
          l.map((x) => ({ ...x, recordedAtUs: x.recordedAt.getTime() * 1000 })),
          d.map((x) => ({ ...x, recordedAtUs: x.recordedAt.getTime() * 1000 })),
        ).get(s.tokenId) ?? [],
      );
      return [open.tokenQty, open.costUsd.toString()];
    };
    const realised = async (s: Awaited<ReturnType<typeof seed>>) =>
      (await s.db.select().from(disposals).where(eq(disposals.walletId, s.walletId))).map((d) =>
        d.realisedPnlUsd === null ? null : D(d.realisedPnlUsd).toString(),
      );

    it("keeps the new shares at what they cost, not the average of old and new", async () => {
      const s = await holding();
      // Sold all 10 for $1,500, bought 10 back for $2,000: between two looks, the balance never moved.
      await s.found({
        kind: "out",
        amount: tokensOf(10),
        at: day(5),
        counterMint: USDC,
        counterAmount: 1_500_000_000n,
      });
      await s.found({
        kind: "in",
        amount: tokensOf(10),
        at: day(6),
        counterMint: USDC,
        counterAmount: 2_000_000_000n,
      });
      await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
      expect(await held(s)).toEqual([tokensOf(10), "2000"]);
      // The sale made $500 on shares that cost $1,000.
      expect(await realised(s)).toEqual(["500"]);
    });

    it("takes a partial sale out of the old shares before the buy that followed it", async () => {
      const s = await holding();
      await s.found({
        kind: "out",
        amount: tokensOf(5),
        at: day(5),
        counterMint: USDC,
        counterAmount: 600_000_000n,
      });
      await s.found({
        kind: "in",
        amount: tokensOf(5),
        at: day(6),
        counterMint: USDC,
        counterAmount: 1_000_000_000n,
      });
      await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
      // 5 left at $100 and 5 bought at $200: $1,500, not the $1,333 the average of all fifteen gave.
      expect(await held(s)).toEqual([tokensOf(10), "1500"]);
      expect(await realised(s)).toEqual(["100"]);
    });

    it("claims no realised figure for a sale for something other than dollars, or a send", async () => {
      const s = await holding();
      await s.found({
        kind: "out",
        amount: tokensOf(2),
        at: day(5),
        counterMint: SOL_MINT,
        counterAmount: 5_000_000_000n,
      });
      await s.found({ kind: "out", amount: tokensOf(1), at: day(6), destinationOwner: "Friend1111" });
      await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
      expect(await held(s)).toEqual([tokensOf(7), "700"]);
      expect(await realised(s)).toEqual([null, null]);
    });
  });

  it("carries a send by hand to the Mercury wallet there, at what the shares cost in this wallet", async () => {
    const s = await seed();
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(1),
      counterMint: USDC,
      counterAmount: 200_000_000n,
    });
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(2),
      counterMint: USDC,
      counterAmount: 600_000_000n,
    });
    await s.found({ kind: "out", amount: tokensOf(1), at: day(3), destinationOwner: MAIN });

    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);

    // Average cost $200: one share arrives in the Mercury wallet at that, exact.
    const [lot] = await mercurySide(s);
    expect([
      lot!.tokenQty,
      D(lot!.unitCostUsd).toString(),
      lot!.source,
      lot!.isEstimated,
      lot!.acquiredAt,
    ]).toEqual([tokensOf(1), "200", "transfer_in", false, day(3)]);
    // What stayed here keeps its own cost.
    const kept = await s.chainLots();
    expect(kept.reduce((n, l) => n + l.tokenQty, 0n)).toBe(tokensOf(3));
    expect(await feedFor(s, "Sig3")).toEqual(
      [
        ["linked", "transfer_out", "Moved to your Mercury wallet"],
        ["mercury", "transfer_in", "Moved from Phan…1111"],
      ].sort(),
    );
  });

  it("carries nothing for a send to somebody else: that is position-sync's departure, as before", async () => {
    const s = await seed();
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(1),
      counterMint: USDC,
      counterAmount: 200_000_000n,
    });
    await s.found({ kind: "out", amount: tokensOf(1), at: day(3), destinationOwner: "Friend1111" });
    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    expect(await mercurySide(s)).toEqual([]);
    expect(await feedFor(s, "Sig2")).toEqual([]);
  });

  it("carries an estimated cost as estimated, from the person's own wallet", async () => {
    const s = await seed();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(5), sourceOwner: "Exchange111" });
    await s.found({ kind: "out", amount: tokensOf(1), at: day(6), destinationOwner: MAIN });
    await costWallet(deps(s.db, pastOf({ TSLA: 250 }).past), s.walletId, NOW);
    const [lot] = await mercurySide(s);
    expect([D(lot!.unitCostUsd).toString(), lot!.isEstimated, lot!.estimateSource]).toEqual([
      "250",
      true,
      "own_wallet",
    ]);
    // Everything left: nothing is held here now.
    expect(await s.chainLots()).toEqual([]);
  });

  it("after the first costing, records a move found since from this wallet's lots, as the relayer's moves are", async () => {
    const s = await seed("done");
    await s.db.insert(lots).values({
      userId: s.userId,
      walletId: s.walletId,
      tokenId: s.tokenId,
      instrumentId: s.instrumentId,
      tokenQty: tokensOf(2),
      shares: "2",
      unitCostUsd: "180",
      acquiredAt: day(1),
      recordedAt: day(1),
      source: "chain",
    });
    // How those lots came: costed on the first pass.
    await s.found({
      kind: "in",
      amount: tokensOf(2),
      at: day(1),
      counterMint: USDC,
      counterAmount: 360_000_000n,
      costed: true,
    });
    await s.found({ kind: "out", amount: tokensOf(2), at: NOW, destinationOwner: MAIN });

    const r = await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);

    expect(r).toMatchObject({ costed: 1, ready: false });
    const [lot] = await mercurySide(s);
    expect([lot!.tokenQty, D(lot!.unitCostUsd).toString()]).toEqual([tokensOf(2), "180"]);
    expect(await feedFor(s, "Sig2")).toEqual(
      [
        ["linked", "transfer_out", "Moved to your Mercury wallet"],
        ["mercury", "transfer_in", "Moved from Phan…1111"],
      ].sort(),
    );
  });

  it("carries a move the relayer already recorded only once, on the first costing or a later one", async () => {
    for (const later of [false, true]) {
      const s = await seed(later ? "done" : "read");
      // A later costing is one with something costed before it.
      if (later)
        await s.found({
          kind: "in",
          amount: tokensOf(1),
          at: day(1),
          counterMint: USDC,
          counterAmount: 100_000_000n,
          costed: true,
        });
      await s.found({ kind: "out", amount: tokensOf(1), at: NOW, destinationOwner: MAIN });
      const sig = later ? "Sig2" : "Sig1";
      // Recorded when the relayer sent it: the linked side's feed row is there.
      await s.db.insert(activities).values({
        userId: s.userId,
        walletId: s.walletId,
        kind: "transfer_out",
        occurredAt: NOW,
        title: "Moved to your Mercury wallet",
        txSignature: sig,
        mint: TSLAX,
      });
      await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
      expect(await mercurySide(s), String(later)).toEqual([]);
      expect(await feedFor(s, sig)).toEqual([["linked", "transfer_out", "Moved to your Mercury wallet"]]);
    }
  });

  it("writes no lot for collateral taken back since: it never left the records", async () => {
    const s = await seed("done");
    await s.found({
      kind: "in",
      amount: tokensOf(10),
      at: day(1),
      counterMint: USDC,
      counterAmount: 2_000_000_000n,
      costed: true,
    });
    await s.found({ kind: "loan_deposit", amount: tokensOf(8), at: day(2), costed: true });
    await s.found({ kind: "loan_withdraw", amount: tokensOf(8), at: day(3) });
    const { past, asked } = pastOf({ TSLA: 250 });
    const r = await costWallet(deps(s.db, past), s.walletId, NOW);
    expect(r).toMatchObject({ lots: 0, costed: 1, ready: false });
    expect(await s.chainLots()).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("writes nothing twice when run again", async () => {
    const s = await seed();
    await s.found({
      kind: "in",
      amount: tokensOf(1),
      at: day(1),
      counterMint: USDC,
      counterAmount: 100_000_000n,
    });
    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    expect(await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW)).toMatchObject({
      lots: 0,
      costed: 0,
    });
    expect(await s.chainLots()).toHaveLength(1);
  });
});

describe("walletToCost", () => {
  it("picks a wallet read and not yet costed, then one ready with arrivals found since, then none", async () => {
    const s = await seed();
    expect(await walletToCost(s.db)).toBe(s.walletId);
    await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW);
    expect(await walletToCost(s.db)).toBeNull();
    await s.found({ kind: "in", amount: tokensOf(1), at: day(8), counterMint: USDC, counterAmount: 1n });
    expect(await walletToCost(s.db)).toBe(s.walletId);
  });

  it("leaves a wallet still being read, and an unlinked one, alone", async () => {
    const s = await seed();
    await s.db.update(historyJobs).set({ status: "running" }).where(eq(historyJobs.walletId, s.walletId));
    expect(await walletToCost(s.db)).toBeNull();
    await s.db.update(historyJobs).set({ status: "read" }).where(eq(historyJobs.walletId, s.walletId));
    await s.db.update(wallets).set({ unlinkedAt: NOW }).where(eq(wallets.id, s.walletId));
    expect(await walletToCost(s.db)).toBeNull();
  });
});

describe("costWallet, a linked wallet's Earn", () => {
  const SHARES = "SteakShares1111111111111111111111111111111";
  const earnVaults = async () => new Map([[SHARES, { address: "SteakVault", name: "Steakhouse USDC" }]]);

  /** Shares of the vault, in or out, and the transaction kept for it. */
  const shareMove = async (
    s: Awaited<ReturnType<typeof seed>>,
    sig: string,
    kind: "in" | "out",
    usdc: bigint,
    at: Date,
  ) => {
    const raw =
      kind === "out"
        ? rawJson({
            signature: sig,
            blockTime: 1,
            succeeded: true,
            accountKeys: [ME],
            feeLamports: 0n,
            preLamports: [],
            postLamports: [],
            preTokens: [{ owner: ME, mint: USDC, rawAmount: 0n, decimals: 6 }],
            postTokens: [{ owner: ME, mint: USDC, rawAmount: usdc, decimals: 6 }],
          })
        : {};
    await s.db.insert(historyTxs).values({ signature: sig, slot: 1n, blockTime: at, raw });
    await s.db.insert(historyEvents).values({
      walletId: s.walletId,
      account: "shares-acct",
      signature: sig,
      blockTime: at,
      kind,
      mint: SHARES,
      amountRaw: 1_000_000n,
      counterMint: kind === "in" ? USDC : null,
      counterAmountRaw: kind === "in" ? usdc : null,
    });
  };

  it("writes the Earn moves found in history to the Earn ledger, so earned so far is measured from them", async () => {
    const s = await seed();
    await shareMove(s, "E1", "in", 500_000_000n, day(2));
    await shareMove(s, "E2", "out", 120_000_000n, day(9));

    await costWallet({ ...deps(s.db, pastOf({}).past), earnVaults }, s.walletId, NOW);

    const rows = await s.db.select().from(earnEvents).where(eq(earnEvents.walletId, s.walletId));
    expect(rows.map((r) => [r.kind, D(r.usdcAmount).toString(), r.vault, r.originSource]).sort()).toEqual(
      [
        ["deposit", "500", "SteakVault", "chain"],
        ["withdraw", "120", "SteakVault", "chain"],
      ].sort(),
    );
    const net = await pgEarnLedger(s.db).netDeposited({ userId: s.userId, walletId: s.walletId });
    expect(net.get("SteakVault")?.toString()).toBe("380");
    const feed = await s.db.select().from(activities).where(eq(activities.txSignature, "E1"));
    expect([feed[0]!.kind, feed[0]!.subtitle]).toEqual([
      "earn_deposit",
      "Steakhouse USDC · found in history",
    ]);
  });

  it("keeps an Earn move Mercury recorded as it was, and writes the rest once", async () => {
    const s = await seed();
    await shareMove(s, "E1", "in", 500_000_000n, day(2));
    await s.db.insert(earnEvents).values({
      userId: s.userId,
      walletId: s.walletId,
      kind: "deposit",
      usdcAmount: "500",
      vault: "SteakVault",
      txSignature: "E1",
      occurredAt: day(2),
    });
    await costWallet({ ...deps(s.db, pastOf({}).past), earnVaults }, s.walletId, NOW);
    await costWallet({ ...deps(s.db, pastOf({}).past), earnVaults }, s.walletId, NOW);
    const rows = await s.db.select().from(earnEvents).where(eq(earnEvents.walletId, s.walletId));
    expect(rows.map((r) => r.originSource)).toEqual(["mercury"]);
  });

  it("marks the share movements costed without Earn when Earn's vaults are not given, as before", async () => {
    const s = await seed();
    await shareMove(s, "E1", "in", 500_000_000n, day(2));
    expect(await costWallet(deps(s.db, pastOf({}).past), s.walletId, NOW)).toMatchObject({ costed: 1 });
    expect(await s.db.select().from(earnEvents)).toEqual([]);
  });
});
