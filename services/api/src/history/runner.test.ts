import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChainHistory, TransactionDetail } from "@mercury/chain";
import { D } from "@mercury/core";
import type { PastPriceSource, PriceBoard } from "@mercury/market";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  historyEvents,
  historyJobs,
  historyTxs,
  instruments,
  lots,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import { DORMANT_IDLE_MS, RECENT_IDLE_MS } from "../jobs/tiers.js";
import type { Log } from "../log/index.js";
import { RateLimited, REFUSAL_PAUSE_MS } from "./budget.js";
import { queueHistory } from "./queue.js";
import { PAST_GIVE_UP_AFTER, costPass, historyPass, listedMints, nextPassIn } from "./runner.js";

const ME = "Phantom1111111111111111111111111111111111111";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const ACCT = "TslaAcct11111111111111111111111111111111111";
const T0 = Date.parse("2026-11-24T12:00:00.000Z");

const bought: TransactionDetail = {
  signature: "S1",
  blockTime: 1_760_000_000,
  succeeded: true,
  accountKeys: [ME],
  feeLamports: 5_000n,
  preLamports: [1n],
  postLamports: [1n],
  preTokens: [],
  postTokens: [{ owner: ME, mint: TSLAX, rawAmount: 10n, decimals: 8 }],
};

const chain = (over: Partial<ChainHistory> = {}): ChainHistory => ({
  tokenAccountsFor: async () => [],
  ownedTokenAccounts: async () => [
    {
      address: ACCT,
      mint: TSLAX,
      programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      rawAmount: 10n,
      decimals: 8,
    },
  ],
  signatures: async (_a, page) =>
    page.until === "S1" ? [] : [{ signature: "S1", slot: 1, blockTime: bought.blockTime, failed: false }],
  transaction: async () => bought,
  ...over,
});

const warned: unknown[] = [];
const log = { warn: (o: unknown) => void warned.push(o) } as unknown as Log;

const seed = async (lastViewedAt: Date | null = null) => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:runner" }).returning();
  await mercuryWallet(db, user!.id);
  const [w] = await db
    .insert(wallets)
    .values({
      userId: user!.id,
      address: ME,
      kind: "external",
      isPrimary: false,
      linkedAt: new Date(T0),
      lastViewedAt,
    })
    .returning();
  const job = async () => (await db.select().from(historyJobs).where(eq(historyJobs.walletId, w!.id)))[0]!;
  return { db, userId: user!.id, walletId: w!.id, job };
};

const run = (db: Awaited<ReturnType<typeof seed>>["db"], history: ChainHistory, laneBusy = () => false) =>
  historyPass({
    db,
    reader: { history, listedMints: async () => new Set([TSLAX]), laneBusy },
    now: () => T0,
    log,
  });

describe("historyPass", () => {
  it("does nothing, and says nothing, with nothing due", async () => {
    const s = await seed();
    expect(await run(s.db, chain())()).toBeNull();
  });

  it("reads a wallet's first read through to read, and its next pass is due by when it was last viewed", async () => {
    const s = await seed(new Date(T0 - 60_000));
    await queueHistory(s.db, { walletId: s.walletId, userId: s.userId, now: new Date(T0) });

    expect(await run(s.db, chain())()).toBe("first read: 1 transactions, 1 events across 1 accounts");
    expect(await s.job()).toMatchObject({
      status: "read",
      cursors: { [ACCT]: "S1" },
      runAfter: new Date(T0 + RECENT_IDLE_MS),
    });
  });

  it("says nothing for a later pass that found nothing new", async () => {
    const s = await seed();
    await queueHistory(s.db, { walletId: s.walletId, userId: s.userId, now: new Date(T0) });
    await s.db
      .update(historyJobs)
      .set({ status: "read", cursors: { [ACCT]: "S1" } })
      .where(eq(historyJobs.walletId, s.walletId));
    expect(await run(s.db, chain())()).toBeNull();
    expect((await s.job()).runAfter).toEqual(new Date(T0 + DORMANT_IDLE_MS));
  });

  it("claims nothing while the jobs' own lane is refused", async () => {
    const s = await seed();
    await queueHistory(s.db, { walletId: s.walletId, userId: s.userId, now: new Date(T0) });
    expect(await run(s.db, chain(), () => true)()).toBeNull();
    expect(await s.job()).toMatchObject({ status: "queued", runAfter: new Date(T0) });
  });

  it("puts the job back for a minute when the node refuses the reader, with no mark against the wallet", async () => {
    const s = await seed();
    await queueHistory(s.db, { walletId: s.walletId, userId: s.userId, now: new Date(T0) });
    const refusing = chain({
      ownedTokenAccounts: async () => {
        throw new RateLimited();
      },
    });
    expect(await run(s.db, refusing)()).toBe("paused: the node refused the reader");
    expect(await s.job()).toMatchObject({
      status: "queued",
      attempts: 0,
      runAfter: new Date(T0 + REFUSAL_PAUSE_MS),
    });
  });

  it("counts any other failure against the job, tries later, and still reports it", async () => {
    const s = await seed();
    await queueHistory(s.db, { walletId: s.walletId, userId: s.userId, now: new Date(T0) });
    const broken = chain({
      transaction: async () => {
        throw new Error("solana getTransaction returned 500");
      },
    });
    await expect(run(s.db, broken)()).rejects.toThrow("returned 500");
    expect(await s.job()).toMatchObject({ status: "queued", attempts: 1, runAfter: new Date(T0 + 60_000) });
    expect((await s.job()).lastError).toContain("returned 500");
  });
});

describe("nextPassIn", () => {
  it("is five minutes for a wallet viewed this week, and an hour otherwise", () => {
    expect(nextPassIn(new Date(T0 - 24 * 60 * 60_000), T0)).toBe(RECENT_IDLE_MS);
    expect(nextPassIn(new Date(T0 - 8 * 24 * 60 * 60_000), T0)).toBe(DORMANT_IDLE_MS);
    expect(nextPassIn(null, T0)).toBe(DORMANT_IDLE_MS);
  });
});

describe("listedMints", () => {
  it("is the stocks' tokens, USDC and the Earn share tokens", async () => {
    const db = await testDb();
    const [i] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
    await db
      .insert(tokens)
      .values({ instrumentId: i!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 });
    const mints = await listedMints({ db, usdcMint: "USDC", earnShareMints: async () => ["Shares"] })();
    expect([...mints].sort()).toEqual(["Shares", TSLAX, "USDC"].sort());
  });

  it("still reads the stocks and USDC when Earn's list cannot be read", async () => {
    const db = await testDb();
    const mints = await listedMints({
      db,
      usdcMint: "USDC",
      earnShareMints: async () => {
        throw new Error("kamino api down");
      },
    })();
    expect([...mints]).toEqual(["USDC"]);
  });
});

describe("costPass", () => {
  const seedRead = async () => {
    const s = await seed();
    await queueHistory(s.db, { walletId: s.walletId, userId: s.userId, now: new Date(T0) });
    await s.db.update(historyJobs).set({ status: "read" }).where(eq(historyJobs.walletId, s.walletId));
    // One transfer in, priced from the past: nothing exact to fall back on.
    await s.db.insert(historyTxs).values({ signature: "S1", slot: 1n, blockTime: new Date(T0), raw: {} });
    await s.db.insert(historyEvents).values({
      walletId: s.walletId,
      account: ACCT,
      signature: "S1",
      blockTime: new Date(T0),
      kind: "in",
      mint: TSLAX,
      amountRaw: 100_000_000n,
      sourceOwner: "Exchange111",
    });
    const [i] = await s.db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
    await s.db
      .insert(tokens)
      .values({ instrumentId: i!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 });
    return s;
  };
  const board: PriceBoard = {
    pricesFor: async (mints) =>
      new Map(
        mints.map((mint) => [
          mint,
          {
            mint,
            usdPricePerToken: D(77),
            pricePerShare: D(77),
            changePct24h: null,
            liquidityUsd: D(0),
            multiplier: D(1),
            observedAt: null,
          },
        ]),
      ),
  };

  it("costs a read wallet and says so, then is quiet", async () => {
    const s = await seedRead();
    let clock = T0;
    const pass = costPass({ db: s.db, past: { priceAt: async () => D(250) }, board, now: () => clock, log });
    expect(await pass()).toBe("first costing: 1 lots, 0 dividends from 1 movements");
    expect((await s.job()).status).toBe("done");
    clock += 1_000;
    expect(await pass()).toBeNull();
  });

  it("rests a failing wallet, and after repeated failures costs it from Mercury's own prices", async () => {
    const s = await seedRead();
    let clock = T0;
    let asked = 0;
    const past: PastPriceSource = {
      priceAt: async () => {
        asked += 1;
        throw new Error("yahoo chart returned 503");
      },
    };
    const pass = costPass({ db: s.db, past, board, now: () => clock, log });

    for (let i = 0; i < PAST_GIVE_UP_AFTER; i++) {
      await expect(pass()).rejects.toThrow("503");
      // Resting: the next pass passes it by until its rest is over.
      expect(await pass()).toBeNull();
      clock += 60 * 60_000;
    }
    expect((await s.job()).status).toBe("read");

    expect(await pass()).toBe("first costing: 1 lots, 0 dividends from 1 movements");
    expect(asked).toBe(PAST_GIVE_UP_AFTER);
    const [lot] = await s.db.select().from(lots).where(eq(lots.walletId, s.walletId));
    expect(lot).toMatchObject({ estimateSource: "link_day_price" });
    expect(D(lot!.unitCostUsd).toString()).toBe("77");
  });
});
