import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChainHistory, OwnedTokenAccount, SignatureRef, TransactionDetail } from "@mercury/chain";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  earnEvents,
  historyEvents,
  historyJobs,
  historyTxs,
  loanEvents,
  users,
  wallets,
} from "../db/schema.js";
import { KAMINO_LENDING_PROGRAM, rawJson } from "./events.js";
import { RateLimited } from "./budget.js";
import { finishHistoryPass } from "./queue.js";
import { GiveWay, PledgeUnknown, readWallet, TransactionUnavailable } from "./reader.js";

const ME = "Phantom1111111111111111111111111111111111111";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TSLA_ACCT = "TslaAcct11111111111111111111111111111111111";
const USDC_ACCT = "UsdcAcct11111111111111111111111111111111111";
const JUNK_ACCT = "JunkAcct11111111111111111111111111111111111";

/** One transaction moving `ME`'s TSLAx from `before` to `after`, paid for in USDC when it rose. */
const move = (signature: string, slot: number, before: bigint, after: bigint): TransactionDetail => {
  const paid = after > before ? (after - before) * 3n : 0n;
  return {
    signature,
    blockTime: 1_760_000_000 + slot,
    succeeded: true,
    accountKeys: [ME],
    feeLamports: 5_000n,
    preLamports: [1_000_000_000n],
    postLamports: [999_995_000n],
    preTokens: [
      ...(before > 0n ? [{ owner: ME, mint: TSLAX, rawAmount: before, decimals: 8 }] : []),
      { owner: ME, mint: USDC, rawAmount: 1_000_000n, decimals: 6 },
    ],
    postTokens: [
      { owner: ME, mint: TSLAX, rawAmount: after, decimals: 8 },
      { owner: ME, mint: USDC, rawAmount: 1_000_000n - paid, decimals: 6 },
    ],
  };
};

/** `move`, made by Kamino's lending program: a pledge when the wallet's TSLAx falls, a withdrawal when it rises. */
const atKamino = (signature: string, slot: number, before: bigint, after: bigint): TransactionDetail => ({
  ...move(signature, slot, before, after),
  accountKeys: [ME, KAMINO_LENDING_PROGRAM],
  // Nothing is paid for collateral coming back.
  postTokens: [
    { owner: ME, mint: TSLAX, rawAmount: after, decimals: 8 },
    { owner: ME, mint: USDC, rawAmount: 1_000_000n, decimals: 6 },
  ],
});

/**
 * A chain with each account's transactions, oldest first as written; it
 * answers newest first, honouring `until`, `before` and `limit` as a node does,
 * and counts every transaction it is asked for.
 */
const chain = (
  owned: readonly OwnedTokenAccount[],
  byAccount: Record<string, readonly { tx: TransactionDetail; failed?: boolean }[]>,
) => {
  const asked: string[] = [];
  const all = new Map(
    Object.values(byAccount)
      .flat()
      .map((e) => [e.tx.signature, e.tx]),
  );
  const history: ChainHistory = {
    tokenAccountsFor: async () => [],
    ownedTokenAccounts: async () => owned,
    signatures: async (address, page) => {
      const newestFirst: SignatureRef[] = [...(byAccount[address] ?? [])]
        .map((e, i) => ({
          signature: e.tx.signature,
          slot: i + 1,
          blockTime: e.tx.blockTime,
          failed: e.failed ?? false,
        }))
        .reverse();
      let from = 0;
      if (page.before !== undefined) from = newestFirst.findIndex((r) => r.signature === page.before) + 1;
      let to = newestFirst.length;
      if (page.until !== undefined) {
        const u = newestFirst.findIndex((r) => r.signature === page.until);
        if (u >= 0) to = u;
      }
      return newestFirst.slice(from, to).slice(0, page.limit);
    },
    transaction: async (signature) => {
      asked.push(signature);
      return all.get(signature) ?? null;
    },
  };
  return { history, asked };
};

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:reader" }).returning();
  await mercuryWallet(db, user!.id);
  const [w] = await db
    .insert(wallets)
    .values({ userId: user!.id, address: ME, kind: "external", isPrimary: false, linkedAt: new Date() })
    .returning();
  return { db, userId: user!.id, walletId: w!.id };
};

const LISTED = async () => new Set([TSLAX, USDC]);
/** Kamino's answer: this many TSLAx pledged today. */
const pledgedOf = (raw: bigint) => async () => [{ mint: TSLAX, rawAmount: raw }];
const quiet = () => false;
const owned = (address: string, mint: string, rawAmount: bigint): OwnedTokenAccount => ({
  address,
  mint,
  programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  rawAmount,
  decimals: 8,
});

describe("readWallet, a first read", () => {
  it("reads back only to the last time the wallet held none, newest first", async () => {
    const s = await seed();
    // Bought, sold out, bought again twice: only the stretch since it was last empty counts.
    const c = chain([owned(TSLA_ACCT, TSLAX, 30n)], {
      [TSLA_ACCT]: [
        { tx: move("S1", 1, 0n, 50n) },
        { tx: move("S2", 2, 50n, 0n) },
        { tx: move("S3", 3, 0n, 10n) },
        { tx: move("S4", 4, 10n, 30n) },
      ],
    });

    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );

    expect(c.asked).toEqual(["S4", "S3"]);
    expect(r).toMatchObject({ cursors: { [TSLA_ACCT]: "S4" }, transactions: 2, events: 2, capped: 0 });
    const events = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(
      events.map((e) => [e.signature, e.kind, e.amountRaw, e.counterMint, e.counterAmountRaw]).sort(),
    ).toEqual([
      ["S3", "in", 10n, USDC, 30n],
      ["S4", "in", 20n, USDC, 60n],
    ]);
    // Kept raw, so a better rule later needs no second read of the chain.
    expect((await s.db.select().from(historyTxs)).map((t) => t.signature).sort()).toEqual(["S3", "S4"]);
  });

  it("reads none of an account's past when it is empty today, and notes where it is", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 0n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 50n) }, { tx: move("S2", 2, 50n, 0n) }],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual([]);
    expect(r.cursors).toEqual({ [TSLA_ACCT]: "S2" });
  });

  it("reads only the tokens Mercury lists", async () => {
    const s = await seed();
    const c = chain([owned(JUNK_ACCT, "MemeCoin", 5n), owned(TSLA_ACCT, TSLAX, 10n)], {
      [JUNK_ACCT]: [{ tx: move("J1", 1, 0n, 5n) }],
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S1"]);
    expect(r.accounts).toBe(1);
  });

  it("pages back through a busy account until it finds where it was empty", async () => {
    const s = await seed();
    const txs = [{ tx: move("S0", 0, 0n, 1n) }];
    for (let i = 1; i <= 6; i++) txs.push({ tx: move(`S${i}`, i, BigInt(i), BigInt(i + 1)) });
    const c = chain([owned(TSLA_ACCT, TSLAX, 7n)], { [TSLA_ACCT]: txs });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, page: 2 },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S6", "S5", "S4", "S3", "S2", "S1", "S0"]);
    expect(r.cursors).toEqual({ [TSLA_ACCT]: "S6" });
  });

  it("stops at the cap on an account that never went to zero, and says so", async () => {
    const s = await seed();
    const txs = [];
    for (let i = 1; i <= 10; i++) txs.push({ tx: move(`S${i}`, i, BigInt(i), BigInt(i + 1)) });
    const c = chain([owned(TSLA_ACCT, TSLAX, 11n)], { [TSLA_ACCT]: txs });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, cap: 3 },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S10", "S9", "S8"]);
    expect(r).toMatchObject({ transactions: 3, capped: 1, cursors: { [TSLA_ACCT]: "S10" } });
  });

  it("skips a transaction that failed on chain, which moved nothing", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }, { tx: move("Failed", 2, 10n, 10n), failed: true }],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S1"]);
    expect(r.events).toBe(1);
  });

  it("fails the pass, rather than lose a purchase for good, when the node won't return a listed transaction", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }],
    });
    const missing: ChainHistory = { ...c.history, transaction: async () => null };
    await expect(
      readWallet(
        { db: s.db, history: missing, listedMints: LISTED, laneBusy: quiet },
        { walletId: s.walletId, address: ME, cursors: {} },
      ),
    ).rejects.toBeInstanceOf(TransactionUnavailable);
  });

  it('walks on past a transaction the node kept without its details: no balances there is not "held none"', async () => {
    const s = await seed();
    const noDetails: TransactionDetail = {
      ...move("Bare", 2, 0n, 0n),
      succeeded: false,
      preTokens: [],
      postTokens: [],
    };
    // Bought 10 at $100, a transaction with no details, then 5 more.
    const c = chain([owned(TSLA_ACCT, TSLAX, 15n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }, { tx: noDetails }, { tx: move("S3", 3, 10n, 15n) }],
    });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S3", "Bare", "S1"]);
    const events = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(events.map((e) => e.signature).sort()).toEqual(["S1", "S3"]);
  });

  it("skips what Mercury itself recorded for the wallet, which its books already have exactly", async () => {
    const s = await seed();
    // An Earn move Mercury built and recorded at confirm time, in the same transaction.
    await s.db.insert(earnEvents).values({
      userId: s.userId,
      walletId: s.walletId,
      kind: "deposit",
      usdcAmount: "60",
      vault: "Vault1111",
      txSignature: "S2",
      occurredAt: new Date(),
    });
    const c = chain([owned(TSLA_ACCT, TSLAX, 30n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }, { tx: move("S2", 2, 10n, 30n) }],
    });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    // Fetched for the walk back, but no event: its figures are Mercury's own.
    expect(c.asked).toEqual(["S2", "S1"]);
    const events = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(events.map((e) => e.signature)).toEqual(["S1"]);
  });

  it("stops at a buy Mercury recorded that took the wallet from none, and says nothing was held before", async () => {
    const s = await seed();
    // Mercury bought 10 (recorded, exact in its books); then 3 sold from Phantom.
    await s.db.insert(earnEvents).values({
      userId: s.userId,
      walletId: s.walletId,
      kind: "deposit",
      usdcAmount: "30",
      vault: "Vault1111",
      txSignature: "S2",
      occurredAt: new Date(),
    });
    const c = chain([owned(TSLA_ACCT, TSLAX, 7n)], {
      [TSLA_ACCT]: [
        { tx: move("Old", 1, 0n, 0n) },
        { tx: move("S2", 2, 0n, 10n) },
        { tx: move("S3", 3, 10n, 7n) },
      ],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S3", "S2"]);
    // The 10 before the sale are Mercury's buy, not shares held from before: no opening to price.
    expect(r.opening).toEqual({});
    const events = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(events.map((e) => [e.signature, e.kind])).toEqual([["S3", "out"]]);
  });

  it("skips what Mercury recorded outright on a later pass", async () => {
    const s = await seed();
    await s.db.insert(earnEvents).values({
      userId: s.userId,
      walletId: s.walletId,
      kind: "deposit",
      usdcAmount: "30",
      vault: "Vault1111",
      txSignature: "S2",
      occurredAt: new Date(),
    });
    const c = chain([owned(TSLA_ACCT, TSLAX, 13n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 3n) }, { tx: move("S2", 2, 3n, 13n) }],
    });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: { [TSLA_ACCT]: "S1" } },
    );
    expect(c.asked).toEqual([]);
  });

  it("says what was held before the oldest transaction where the node keeps no older history", async () => {
    const s = await seed();
    // The account's history starts with 4 already in it.
    const c = chain([owned(TSLA_ACCT, TSLAX, 6n)], { [TSLA_ACCT]: [{ tx: move("S1", 1, 4n, 6n) }] });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(r.opening).toEqual({
      [TSLA_ACCT]: { mint: TSLAX, raw: "4", at: new Date((1_760_000_000 + 1) * 1000).toISOString() },
    });
  });

  it("reads a pledge Mercury recorded all the same: it moves no cost, and the walk back needs it", async () => {
    const s = await seed();
    await s.db.insert(loanEvents).values({
      userId: s.userId,
      walletId: s.walletId,
      kind: "pledge",
      debtAfterUsd: "0",
      collateralAfterUsd: "100",
      txSignature: "S2",
      occurredAt: new Date(),
    });
    // Bought 10, pledged all 10 through Mercury, bought 5 more.
    const c = chain([owned(TSLA_ACCT, TSLAX, 5n)], {
      [TSLA_ACCT]: [
        { tx: move("S1", 1, 0n, 10n) },
        { tx: atKamino("S2", 2, 10n, 0n) },
        { tx: move("S3", 3, 0n, 5n) },
      ],
    });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, pledged: pledgedOf(10n) },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S3", "S2", "S1"]);
  });
});

describe("readWallet, shares pledged to Kamino", () => {
  it("reads an account emptied by pledging, back to where its shares were bought", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 0n)], {
      [TSLA_ACCT]: [
        { tx: move("Old1", 1, 0n, 7n) },
        { tx: move("Old2", 2, 7n, 0n) },
        { tx: move("S1", 3, 0n, 10n) },
        { tx: atKamino("S2", 4, 10n, 0n) },
      ],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, pledged: pledgedOf(10n) },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S2", "S1"]);
    expect(r).toMatchObject({ cursors: { [TSLA_ACCT]: "S2" }, capped: 0 });
    const events = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(events.map((e) => [e.signature, e.kind, e.amountRaw]).sort()).toEqual([
      ["S1", "in", 10n],
      ["S2", "loan_deposit", 10n],
    ]);
  });

  it("walks past a moment the wallet held none because the rest was pledged", async () => {
    const s = await seed();
    // Bought 10, pledged them all, bought 5: before the 5, the wallet's account was empty but 10 were held.
    const c = chain([owned(TSLA_ACCT, TSLAX, 5n)], {
      [TSLA_ACCT]: [
        { tx: move("Old1", 1, 0n, 7n) },
        { tx: move("Old2", 2, 7n, 0n) },
        { tx: move("S1", 3, 0n, 10n) },
        { tx: atKamino("S2", 4, 10n, 0n) },
        { tx: move("S3", 5, 0n, 5n) },
      ],
    });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, pledged: pledgedOf(10n) },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S3", "S2", "S1"]);
  });

  it("counts a withdrawal back as held before it, in the loan", async () => {
    const s = await seed();
    // Bought 10, pledged 10, took 4 back: 6 still pledged, 4 in the wallet.
    const c = chain([owned(TSLA_ACCT, TSLAX, 4n)], {
      [TSLA_ACCT]: [
        { tx: move("Old1", 1, 0n, 7n) },
        { tx: move("Old2", 2, 7n, 0n) },
        { tx: move("S1", 3, 0n, 10n) },
        { tx: atKamino("S2", 4, 10n, 0n) },
        { tx: atKamino("S3", 5, 0n, 4n) },
      ],
    });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, pledged: pledgedOf(6n) },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S3", "S2", "S1"]);
    const events = await s.db.select().from(historyEvents).where(eq(historyEvents.walletId, s.walletId));
    expect(events.map((e) => [e.signature, e.kind]).sort()).toEqual([
      ["S1", "in"],
      ["S2", "loan_deposit"],
      ["S3", "loan_withdraw"],
    ]);
  });

  it("keeps what was held, pledged included, where the walk stopped at its cap, for the opening balance", async () => {
    const s = await seed();
    await s.db.insert(historyJobs).values({ walletId: s.walletId, userId: s.userId, status: "running" });
    // 10 pledged long ago; 6 bought and pledged since. The cap stops the walk with 10 still in the loan.
    const c = chain([owned(TSLA_ACCT, TSLAX, 0n)], {
      [TSLA_ACCT]: [
        { tx: move("S0", 1, 0n, 10n) },
        { tx: atKamino("S1", 2, 10n, 0n) },
        { tx: move("S2", 3, 0n, 6n) },
        { tx: atKamino("S3", 4, 6n, 0n) },
      ],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, pledged: pledgedOf(16n), cap: 2 },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S3", "S2"]);
    const opening = {
      [TSLA_ACCT]: { mint: TSLAX, raw: "10", at: new Date((1_760_000_000 + 3) * 1000).toISOString() },
    };
    expect(r).toMatchObject({ capped: 1, opening });

    await finishHistoryPass(s.db, {
      walletId: s.walletId,
      cursors: r.cursors,
      opening: r.opening,
      now: new Date(),
      nextRunAfter: new Date(),
    });
    const [job] = await s.db.select().from(historyJobs).where(eq(historyJobs.walletId, s.walletId));
    expect(job!.opening).toEqual(opening);
  });

  it("waits, uncounted, when Kamino cannot be read, rather than read a pledged holding as sold", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 0n)], { [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }] });
    await expect(
      readWallet(
        {
          db: s.db,
          history: c.history,
          listedMints: LISTED,
          laneBusy: quiet,
          pledged: async () => {
            throw new Error("kamino 503");
          },
        },
        { walletId: s.walletId, address: ME, cursors: {} },
      ),
    ).rejects.toBeInstanceOf(PledgeUnknown);
    expect(c.asked).toEqual([]);
  });
});

describe("readWallet, a later pass", () => {
  it("reads only what is newer than each account's cursor", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 60n), owned(USDC_ACCT, USDC, 0n)], {
      [TSLA_ACCT]: [
        { tx: move("S1", 1, 0n, 10n) },
        { tx: move("S2", 2, 10n, 30n) },
        { tx: move("S3", 3, 30n, 60n) },
      ],
      [USDC_ACCT]: [],
    });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: { [TSLA_ACCT]: "S1" } },
    );
    expect(c.asked).toEqual(["S3", "S2"]);
    expect(r.cursors).toEqual({ [TSLA_ACCT]: "S3" });
  });

  it("keeps an account's cursor where it was when nothing is new", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], { [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }] });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: { [TSLA_ACCT]: "S1" } },
    );
    expect(c.asked).toEqual([]);
    expect(r.cursors).toEqual({});
  });

  it("writes nothing twice when a transaction is read again", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], { [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }] });
    const deps = { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet };
    await readWallet(deps, { walletId: s.walletId, address: ME, cursors: {} });
    await readWallet(deps, { walletId: s.walletId, address: ME, cursors: {} });
    expect(await s.db.select().from(historyEvents)).toHaveLength(1);
    expect(await s.db.select().from(historyTxs)).toHaveLength(1);
  });
});

describe("readWallet, stopped part way and read again", () => {
  /** A busy account: 0 to 1, then up by one each time, so the walk back never finds it empty before S0. */
  const busy = (n: number) => {
    const txs = [{ tx: move("S0", 0, 0n, 1n) }];
    for (let i = 1; i < n; i++) txs.push({ tx: move(`S${i}`, i, BigInt(i), BigInt(i + 1)) });
    return txs;
  };
  /** The same chain, refusing from its `n`th transaction on, as a node out of allowance does. */
  const refusingFrom = (c: ReturnType<typeof chain>, n: number): ChainHistory => {
    let asked = 0;
    return {
      ...c.history,
      transaction: async (sig) => {
        asked += 1;
        if (asked >= n) throw new RateLimited();
        return c.history.transaction(sig);
      },
    };
  };

  it("keeps what it read before the node refused, and asks the node only for the rest next time", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 8n)], { [TSLA_ACCT]: busy(8) });
    const deps = { db: s.db, listedMints: LISTED, laneBusy: quiet, page: 3 };
    await expect(
      readWallet(
        { ...deps, history: refusingFrom(c, 5) },
        { walletId: s.walletId, address: ME, cursors: {} },
      ),
    ).rejects.toBeInstanceOf(RateLimited);
    // Four read before the refusal, all kept.
    expect((await s.db.select().from(historyTxs)).map((t) => t.signature).sort()).toEqual([
      "S4",
      "S5",
      "S6",
      "S7",
    ]);

    c.asked.length = 0;
    const r = await readWallet(
      { ...deps, history: c.history },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    // Only what the first pass never got: the node is not asked for S7 to S4 again.
    expect(c.asked).toEqual(["S3", "S2", "S1", "S0"]);
    expect(r).toMatchObject({ transactions: 8, events: 8, capped: 0 });
    expect(await s.db.select().from(historyEvents)).toHaveLength(8);
  });

  it("reads what it kept back exactly as the node said it, SOL and all", async () => {
    const s = await seed();
    const paidInSol: TransactionDetail = {
      ...move("S1", 1, 0n, 10n),
      preLamports: [3_000_000_000n],
      postLamports: [1_999_995_000n],
      preTokens: [],
      postTokens: [{ owner: ME, mint: TSLAX, rawAmount: 10n, decimals: 8 }],
    };
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], { [TSLA_ACCT]: [{ tx: paidInSol }] });
    // Kept by an earlier pass that stopped before writing its events.
    await s.db
      .insert(historyTxs)
      .values({ signature: "S1", slot: 1n, blockTime: null, raw: rawJson(paidInSol) });
    await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual([]);
    const [e] = await s.db.select().from(historyEvents);
    expect([e!.counterMint, e!.counterAmountRaw]).toEqual([
      "So11111111111111111111111111111111111111112",
      1_000_000_000n,
    ]);
  });

  it("keeps each account's cursor as soon as it is read, so a pass stopped on the next doesn't walk it again", async () => {
    const s = await seed();
    await s.db.insert(historyJobs).values({ walletId: s.walletId, userId: s.userId, status: "running" });
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n), owned(USDC_ACCT, USDC, 5n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }],
      [USDC_ACCT]: [{ tx: move("U1", 1, 0n, 5n) }],
    });
    const stopsOnUsdc: ChainHistory = {
      ...c.history,
      transaction: async (sig) => {
        if (sig === "U1") throw new RateLimited();
        return c.history.transaction(sig);
      },
    };
    await expect(
      readWallet(
        { db: s.db, history: stopsOnUsdc, listedMints: LISTED, laneBusy: quiet },
        { walletId: s.walletId, address: ME, cursors: {} },
      ),
    ).rejects.toBeInstanceOf(RateLimited);
    const [job] = await s.db.select().from(historyJobs).where(eq(historyJobs.walletId, s.walletId));
    expect(job!.cursors).toEqual({ [TSLA_ACCT]: "S1" });
    // Still a first read until every account is done.
    expect(job!.status).toBe("running");
  });

  it("reads a long account all the way back to where it was empty: no cap unless one is set", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 12n)], { [TSLA_ACCT]: busy(12) });
    const r = await readWallet(
      { db: s.db, history: c.history, listedMints: LISTED, laneBusy: quiet, page: 5 },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(r).toMatchObject({ transactions: 12, capped: 0 });
  });
});

describe("readWallet, giving way", () => {
  it("stops when the jobs' own lane is being refused, before reading anything", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], { [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }] });
    await expect(
      readWallet(
        { db: s.db, history: c.history, listedMints: LISTED, laneBusy: () => true },
        { walletId: s.walletId, address: ME, cursors: {} },
      ),
    ).rejects.toBeInstanceOf(GiveWay);
    expect(c.asked).toEqual([]);
  });

  it("refuses a chain client that cannot list token accounts, rather than reading nothing quietly", async () => {
    const s = await seed();
    const { ownedTokenAccounts: _, ...without } = chain([], {}).history;
    await expect(
      readWallet(
        { db: s.db, history: without, listedMints: LISTED, laneBusy: quiet },
        { walletId: s.walletId, address: ME, cursors: {} },
      ),
    ).rejects.toThrow("cannot list token accounts");
  });
});
