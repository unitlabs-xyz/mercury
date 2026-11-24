import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChainHistory, OwnedTokenAccount, SignatureRef, TransactionDetail } from "@mercury/chain";
import { mercuryWallet, testDb } from "../db/testing.js";
import { historyEvents, historyTxs, loanEvents, users, wallets } from "../db/schema.js";
import { GiveWay, readWallet } from "./reader.js";

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
const quiet = () => false;
const owned = (address: string, mint: string, rawAmount: bigint): OwnedTokenAccount => ({
  address,
  mint,
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

  it("skips failed and pruned transactions", async () => {
    const s = await seed();
    const c = chain([owned(TSLA_ACCT, TSLAX, 10n)], {
      [TSLA_ACCT]: [{ tx: move("S1", 1, 0n, 10n) }, { tx: move("Failed", 2, 10n, 10n), failed: true }],
    });
    const pruned: ChainHistory = {
      ...c.history,
      transaction: async (sig) => (sig === "S1" ? c.history.transaction(sig) : null),
    };
    const r = await readWallet(
      { db: s.db, history: pruned, listedMints: LISTED, laneBusy: quiet },
      { walletId: s.walletId, address: ME, cursors: {} },
    );
    expect(c.asked).toEqual(["S1"]);
    expect(r.events).toBe(1);
  });

  it("skips what Mercury itself recorded for the wallet, which its books already have exactly", async () => {
    const s = await seed();
    // A borrow Mercury built and recorded at confirm time, in the same transaction.
    await s.db.insert(loanEvents).values({
      userId: s.userId,
      walletId: s.walletId,
      kind: "borrow",
      usdAmount: "60",
      debtAfterUsd: "60",
      collateralAfterUsd: "100",
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
    expect(c.asked).toEqual(["S1"]);
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
