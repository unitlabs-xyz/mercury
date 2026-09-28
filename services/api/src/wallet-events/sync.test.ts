import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChainHistory, SignatureRef, TransactionDetail } from "@mercury/chain";
import { USDC_MINT } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, users, walletStreams, wallets } from "../db/schema.js";
import { syncAllWalletEvents } from "./sync.js";

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
      history: node({ [WALLET]: [ref], [USDC_ACCOUNT]: [ref] }),
    });

    expect(summary).toEqual({ wallets: 1, checked: 1, failed: 0, written: 0 });
    const rows = await db.select().from(activities);
    expect(rows).toEqual([]);

    const streams = await db.select().from(walletStreams);
    expect(streams.map((s) => s.address).sort()).toEqual([USDC_ACCOUNT, WALLET].sort());
    expect(streams.every((s) => s.cursor === SIG)).toBe(true);
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

    const first = await syncAllWalletEvents(db, { history });
    expect(first.written).toBe(1);

    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("transfer_in");
    expect(rows[0]!.title).toBe("Added cash");
    expect(rows[0]!.mint).toBe(USDC_MINT);
    expect(rows[0]!.txSignature).toBe(SIG);
    expect(Number(rows[0]!.amountUsd)).toBe(500);
    expect(rows[0]!.occurredAt).toEqual(new Date(1_790_573_221 * 1000));

    // Replay the same window: the unique index must absorb it.
    await db.update(walletStreams).set({ cursor: "older" });
    const second = await syncAllWalletEvents(db, { history });
    expect(second.written).toBe(0);
    expect(await db.select().from(activities).where(eq(activities.userId, userId))).toHaveLength(1);
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
    });

    expect(summary.failed).toBe(1);
    expect(summary.written).toBe(0);
    const streams = await db.select().from(walletStreams).where(eq(walletStreams.address, WALLET));
    expect(streams[0]!.cursor).toBe("older");
  });
});
