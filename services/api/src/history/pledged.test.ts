import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { D } from "@mercury/core";
import type { ChainHistory, SignatureRef, TransactionDetail } from "@mercury/chain";
import { mercuryWallet, testDb } from "../db/testing.js";
import { historyJobs, instruments, lots, tokens, users, wallets } from "../db/schema.js";
import { costWallet } from "./cost.js";
import { KAMINO_LENDING_PROGRAM } from "./events.js";
import { finishHistoryPass } from "./queue.js";
import { readWallet } from "./reader.js";

/**
 * A linked wallet whose shares are pledged to Kamino, read and costed end to
 * end: the person who bought 10 TSLAx at $200 and pledged some or all of it
 * still holds 10 at $200, whatever the wallet's own account says.
 */

const ME = "Phantom1111111111111111111111111111111111111";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ACCT = "TslaAcct11111111111111111111111111111111111";
const RESERVE = "Reserve11111111111111111111111111111111111";
const NOW = new Date("2026-11-24T12:00:00.000Z");
const whole = (n: number) => BigInt(n) * 100_000_000n;

const tx = (
  signature: string,
  slot: number,
  tsla: [bigint, bigint],
  usdc: [bigint, bigint],
  kamino = false,
): TransactionDetail => ({
  signature,
  blockTime: 1_760_000_000 + slot * 86_400,
  succeeded: true,
  accountKeys: kamino ? [ME, KAMINO_LENDING_PROGRAM] : [ME],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n],
  postLamports: [999_995_000n],
  preTokens: [
    { owner: ME, mint: TSLAX, rawAmount: tsla[0], decimals: 8 },
    { owner: ME, mint: USDC, rawAmount: usdc[0], decimals: 6 },
    ...(kamino ? [{ owner: RESERVE, mint: TSLAX, rawAmount: 0n, decimals: 8 }] : []),
  ],
  postTokens: [
    { owner: ME, mint: TSLAX, rawAmount: tsla[1], decimals: 8 },
    { owner: ME, mint: USDC, rawAmount: usdc[1], decimals: 6 },
    ...(kamino ? [{ owner: RESERVE, mint: TSLAX, rawAmount: tsla[0] - tsla[1], decimals: 8 }] : []),
  ],
});

/** Bought 10 TSLAx for $2,000 of USDC. */
const BUY = tx("Buy", 1, [0n, whole(10)], [2_000_000_000n, 0n]);

const run = async (walletToday: bigint, pledgedToday: bigint, txs: readonly TransactionDetail[]) => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:pledged" }).returning();
  await mercuryWallet(db, user!.id);
  const [w] = await db
    .insert(wallets)
    .values({ userId: user!.id, address: ME, kind: "external", isPrimary: false, linkedAt: NOW })
    .returning();
  const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 });
  await db.insert(historyJobs).values({ walletId: w!.id, userId: user!.id, status: "running" });

  const history: ChainHistory = {
    tokenAccountsFor: async () => [],
    ownedTokenAccounts: async () => [
      { address: ACCT, mint: TSLAX, programId: "Tokenz", rawAmount: walletToday, decimals: 8 },
    ],
    signatures: async (address, page) => {
      const refs: SignatureRef[] = txs
        .map((t, i) => ({ signature: t.signature, slot: i + 1, blockTime: t.blockTime, failed: false }))
        .reverse();
      const from = page.before === undefined ? 0 : refs.findIndex((r) => r.signature === page.before) + 1;
      return address === ACCT ? refs.slice(from, from + page.limit) : [];
    },
    transaction: async (signature) => txs.find((t) => t.signature === signature) ?? null,
  };
  const r = await readWallet(
    {
      db,
      history,
      listedMints: async () => new Set([TSLAX, USDC]),
      laneBusy: () => false,
      pledged: async () => (pledgedToday > 0n ? [{ mint: TSLAX, rawAmount: pledgedToday }] : []),
    },
    { walletId: w!.id, address: ME, cursors: {} },
  );
  await finishHistoryPass(db, { walletId: w!.id, cursors: r.cursors, now: NOW, nextRunAfter: NOW });
  const asked: string[] = [];
  await costWallet(
    {
      db,
      past: {
        priceAt: async (symbol) => {
          asked.push(symbol);
          return D(250);
        },
      },
      board: { pricesFor: async () => new Map() },
    },
    w!.id,
    NOW,
  );
  const held = await db
    .select()
    .from(lots)
    .where(and(eq(lots.walletId, w!.id), eq(lots.source, "chain")));
  return {
    held: held.map((l) => [l.tokenQty, D(l.unitCostUsd).toString(), l.isEstimated]),
    asked,
  };
};

describe("a linked wallet's shares pledged to Kamino, read and costed", () => {
  it("keeps all 10 at $200 when 8 are pledged and 2 are in the wallet", async () => {
    const r = await run(whole(2), whole(8), [BUY, tx("Pledge", 2, [whole(10), whole(2)], [0n, 0n], true)]);
    expect(r.held).toEqual([[whole(10), "200", false]]);
    expect(r.asked).toEqual([]);
  });

  it("keeps all 10 at $200 when every share is pledged and the wallet's account is empty", async () => {
    const r = await run(0n, whole(10), [BUY, tx("Pledge", 2, [whole(10), 0n], [0n, 0n], true)]);
    expect(r.held).toEqual([[whole(10), "200", false]]);
  });

  it("keeps all 10 at $200 after 8 are pledged and taken back, rather than pricing them again", async () => {
    const r = await run(whole(10), 0n, [
      BUY,
      tx("Pledge", 2, [whole(10), whole(2)], [0n, 0n], true),
      tx("Withdraw", 3, [whole(2), whole(10)], [0n, 0n], true),
    ]);
    expect(r.held).toEqual([[whole(10), "200", false]]);
    expect(r.asked).toEqual([]);
  });
});
