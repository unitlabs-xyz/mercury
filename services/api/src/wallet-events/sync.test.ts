import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChainHistory, SignatureRef, TransactionDetail } from "@mercury/chain";
import { USDC_MINT } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, users, walletStreams, wallets } from "../db/schema.js";
import { syncAllWalletEvents } from "./sync.js";

const KAMINO = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const USDC_ACCOUNT = "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:test" }).returning();
  await db.insert(wallets).values({ userId: user!.id, address: WALLET, kind: "privy_embedded" });
  return { db, userId: user!.id };
};

const deposit: TransactionDetail = {
  signature: SIG,
  blockTime: 1_790_573_221,
  succeeded: true,
  accountKeys: ["FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W", USDC_ACCOUNT],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n, 2_039_280n],
  postLamports: [999_995_000n, 2_039_280n],
  preTokens: [],
  postTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 500_000_000n, decimals: 6 }],
};

const ref: SignatureRef = { signature: SIG, slot: 451_224_633, blockTime: 1_790_573_221, failed: false };

/** A node that knows one USDC account and one deposit, on the account's stream. */
const node = (signaturesByAddress: Record<string, readonly SignatureRef[]>): ChainHistory => ({
  tokenAccountsFor: () => Promise.resolve([USDC_ACCOUNT]),
  signatures: (address, page) => {
    const all = signaturesByAddress[address] ?? [];
    // `until` is only ever the cursor; once set, this fake has nothing newer.
    return Promise.resolve(page.until === undefined ? all.slice(0, page.limit) : []);
  },
  transaction: (signature) => Promise.resolve(signature === SIG ? deposit : null),
});

describe("syncAllWalletEvents", () => {
  it("records where each stream is on first sight, and writes nothing", async () => {
    const { db } = await seed();
    const summary = await syncAllWalletEvents(db, {
      lendingProgram: KAMINO,
      history: node({ [WALLET]: [ref], [USDC_ACCOUNT]: [ref] }),
    });

    expect(summary).toEqual({ wallets: 1, checked: 1, failed: 0, written: 0 });
    const rows = await db.select().from(activities);
    expect(rows).toEqual([]);

    const streams = await db.select().from(walletStreams);
    expect(streams.map((s) => s.address).sort()).toEqual([USDC_ACCOUNT, WALLET].sort());
    expect(streams.every((s) => s.cursor === SIG)).toBe(true);
  });

  it("backfills the very first deposit into a fresh wallet, even though the wallet's own stream has no prior history to baseline against", async () => {
    // The regression this guards: a Privy wallet is created off-chain, so its
    // own address can have zero signature history for any number of passes.
    // The pass where the first deposit lands is often also the first pass
    // that ever touches the wallet's own stream — so if "was this wallet
    // already known" were read from the wallet's own cursor rather than from
    // whether its stream row already existed, that cursor would still be
    // null on exactly this pass, and the newly discovered USDC stream would
    // baseline right along with it, losing the deposit that funded it.
    const { db, userId } = await seed();

    let ataExists = false;
    const history: ChainHistory = {
      tokenAccountsFor: () => Promise.resolve(ataExists ? [USDC_ACCOUNT] : []),
      signatures: (addr) => {
        if (!ataExists) return Promise.resolve([]);
        return Promise.resolve(addr === WALLET || addr === USDC_ACCOUNT ? [ref] : []);
      },
      transaction: (signature) => Promise.resolve(signature === SIG ? deposit : null),
    };

    // Pass one: nothing on chain yet. The wallet's own stream is created and
    // baselines on empty history, same as any brand-new wallet — its cursor
    // stays null because there is nothing yet to advance it past.
    const first = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(first.written).toBe(0);
    const ownAfterFirst = await db.select().from(walletStreams).where(eq(walletStreams.address, WALLET));
    expect(ownAfterFirst[0]!.cursor).toBeNull();

    // Pass two: the deposit lands, creating the ATA. The same signature shows
    // up under both streams — it is "the transaction that creates the USDC
    // account" per spec §4 — and the ATA must be backfilled, not baselined.
    ataExists = true;
    const second = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(second.written).toBe(1);

    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.txSignature).toBe(SIG);
  });

  it("writes a deposit once, and writes nothing at all on a second pass", async () => {
    const { db, userId } = await seed();
    // Put both streams behind the deposit, so the first pass has work to do.
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    await db.insert(walletStreams).values([
      { walletId: wallet!.id, address: WALLET, cursor: "older" },
      { walletId: wallet!.id, address: USDC_ACCOUNT, cursor: "older" },
    ]);

    const history: ChainHistory = {
      tokenAccountsFor: () => Promise.resolve([USDC_ACCOUNT]),
      signatures: (address) => Promise.resolve(address === USDC_ACCOUNT ? [ref] : []),
      transaction: () => Promise.resolve(deposit),
    };

    const first = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(first.written).toBe(1);

    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("transfer_in");
    expect(rows[0]!.title).toBe("Added cash");
    expect(rows[0]!.mint).toBe(USDC_MINT);
    expect(rows[0]!.txSignature).toBe(SIG);
    // The exact string, not a float round-trip: never a float for money.
    expect(rows[0]!.amountUsd).toBe("500.000000000000000000");
    expect(rows[0]!.occurredAt).toEqual(new Date(1_790_573_221 * 1000));

    // Replay the same window: the unique index must absorb it.
    await db.update(walletStreams).set({ cursor: "older" });
    const second = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(second.written).toBe(0);
    expect(await db.select().from(activities).where(eq(activities.userId, userId))).toHaveLength(1);
  });

  it("backfills a token stream discovered this pass, instead of losing what happened before it was found", async () => {
    const { db, userId } = await seed();
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    // The wallet's own stream is already established; its USDC account has not
    // been discovered yet — this pass is the one that finds it.
    await db.insert(walletStreams).values({ walletId: wallet!.id, address: WALLET, cursor: "older" });

    const SIG_T = "sig-T-creates-the-ata";
    const SIG_U = "sig-U-second-deposit";
    const refT: SignatureRef = { signature: SIG_T, slot: 100, blockTime: 1_790_573_100, failed: false };
    const refU: SignatureRef = { signature: SIG_U, slot: 200, blockTime: 1_790_573_400, failed: false };
    const txT: TransactionDetail = {
      signature: SIG_T,
      blockTime: 1_790_573_100,
      succeeded: true,
      accountKeys: [],
      feeLamports: 0n,
      preLamports: [],
      postLamports: [],
      preTokens: [],
      postTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 300_000_000n, decimals: 6 }],
    };
    const txU: TransactionDetail = {
      signature: SIG_U,
      blockTime: 1_790_573_400,
      succeeded: true,
      accountKeys: [],
      feeLamports: 0n,
      preLamports: [],
      postLamports: [],
      preTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 300_000_000n, decimals: 6 }],
      postTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 500_000_000n, decimals: 6 }],
    };

    // The ATA's own signature history holds both: T, the transaction that
    // created and funded it, and U, a later deposit from someone else. Real
    // Solana indexes both under the ATA once it exists, but only T also shows
    // up under the wallet's own address — which is exactly why a stream
    // discovered this pass has to be walked in full rather than baselined to
    // its newest entry: baselining would record U as the starting point and
    // never emit it.
    const history: ChainHistory = {
      tokenAccountsFor: () => Promise.resolve([USDC_ACCOUNT]),
      signatures: (addr) => Promise.resolve(addr === USDC_ACCOUNT ? [refU, refT] : []),
      transaction: (sig) => Promise.resolve(sig === SIG_T ? txT : sig === SIG_U ? txU : null),
    };

    const summary = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(summary.written).toBe(2);

    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows.map((r) => r.txSignature).sort()).toEqual([SIG_T, SIG_U].sort());

    const ataStream = await db.select().from(walletStreams).where(eq(walletStreams.address, USDC_ACCOUNT));
    expect(ataStream[0]!.cursor).toBe(SIG_U);
  });

  it("still backfills a stream discovered by a pass that then fails, instead of baselining it on retry", async () => {
    // This is the exact sequence f877820 was written to prevent, and the one
    // that broke it again: the stream row is discovered and committed, the
    // pass then dies before it can walk it, and a naive retry — one that
    // decides "backfill" from what this pass remembers rather than from what
    // is on disk — sees no memory of the discovery and baselines the stream
    // instead, silently dropping everything that funded it.
    const { db, userId } = await seed();
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    await db.insert(walletStreams).values({ walletId: wallet!.id, address: WALLET, cursor: "older" });

    const SIG_T = "sig-T-creates-the-ata-retry";
    const SIG_U = "sig-U-second-deposit-retry";
    const refT: SignatureRef = { signature: SIG_T, slot: 100, blockTime: 1_790_573_100, failed: false };
    const refU: SignatureRef = { signature: SIG_U, slot: 200, blockTime: 1_790_573_400, failed: false };
    const txT: TransactionDetail = {
      signature: SIG_T,
      blockTime: 1_790_573_100,
      succeeded: true,
      accountKeys: [],
      feeLamports: 0n,
      preLamports: [],
      postLamports: [],
      preTokens: [],
      postTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 300_000_000n, decimals: 6 }],
    };
    const txU: TransactionDetail = {
      signature: SIG_U,
      blockTime: 1_790_573_400,
      succeeded: true,
      accountKeys: [],
      feeLamports: 0n,
      preLamports: [],
      postLamports: [],
      preTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 300_000_000n, decimals: 6 }],
      postTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 500_000_000n, decimals: 6 }],
    };

    // Fails once, on whichever signature is read first, then answers
    // correctly for the rest of this pass and every pass after it — a single
    // transient RPC error, not a permanently broken node.
    let failedOnce = false;
    const history: ChainHistory = {
      tokenAccountsFor: () => Promise.resolve([USDC_ACCOUNT]),
      signatures: (addr) => Promise.resolve(addr === USDC_ACCOUNT ? [refU, refT] : []),
      transaction: (sig) => {
        if (!failedOnce) {
          failedOnce = true;
          return Promise.resolve(null);
        }
        return Promise.resolve(sig === SIG_T ? txT : sig === SIG_U ? txU : null);
      },
    };

    // Pass one: the ATA is discovered and its stream row committed, but the
    // transaction read fails, so the pass throws and nothing else is written.
    const first = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(first.failed).toBe(1);
    expect(first.written).toBe(0);

    const ataAfterFirst = await db
      .select()
      .from(walletStreams)
      .where(eq(walletStreams.address, USDC_ACCOUNT));
    expect(ataAfterFirst).toHaveLength(1);
    expect(ataAfterFirst[0]!.cursor).toBeNull();

    // Pass two: the ATA's stream row already exists with a null cursor, so
    // this pass never re-runs discovery — it has to recognise the backfill
    // from that null cursor sitting next to the wallet's own already-advanced
    // one, not from any memory of pass one.
    const second = await syncAllWalletEvents(db, { history, lendingProgram: KAMINO });
    expect(second.failed).toBe(0);
    expect(second.written).toBe(2);

    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows.map((r) => r.txSignature).sort()).toEqual([SIG_T, SIG_U].sort());

    const ataAfterSecond = await db
      .select()
      .from(walletStreams)
      .where(eq(walletStreams.address, USDC_ACCOUNT));
    expect(ataAfterSecond[0]!.cursor).toBe(SIG_U);
  });

  it("leaves the cursor alone when a transaction cannot be fetched, so nothing is stepped over", async () => {
    const { db } = await seed();
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    await db.insert(walletStreams).values({ walletId: wallet!.id, address: WALLET, cursor: "older" });

    const summary = await syncAllWalletEvents(db, {
      history: {
        tokenAccountsFor: () => Promise.resolve([]),
        signatures: (address) => Promise.resolve(address === WALLET ? [ref] : []),
        transaction: () => Promise.resolve(null),
      },
      lendingProgram: KAMINO,
    });

    expect(summary.failed).toBe(1);
    expect(summary.written).toBe(0);
    const streams = await db.select().from(walletStreams).where(eq(walletStreams.address, WALLET));
    expect(streams[0]!.cursor).toBe("older");
  });
});
