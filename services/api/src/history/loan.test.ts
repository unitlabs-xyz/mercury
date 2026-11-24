import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, instruments, loanEvents, tokens, users, wallets } from "../db/schema.js";
import type { KaminoLoanTx, KaminoLoans } from "../lending/kamino-loans.js";
import type { LendingPosition } from "../lending/ports.js";
import { readLoanHistory } from "./loan.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const pledged: KaminoLoanTx = {
  signature: "L1",
  at: new Date("2026-03-03T10:00:00.000Z"),
  action: "deposit",
  mint: TSLAX,
  symbol: "TSLAx",
  amount: D(10),
  priceUsd: D("240.1"),
  valueUsd: D(2401),
  liquidation: false,
};

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:loan-read" }).returning();
  await mercuryWallet(db, user!.id);
  const [w] = await db
    .insert(wallets)
    .values({ userId: user!.id, address: "Phantom1", kind: "external", isPrimary: false })
    .returning();
  const [tsla] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  await db
    .insert(tokens)
    .values({ instrumentId: tsla!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 });
  return { db, wallet: { userId: user!.id, walletId: w!.id, address: "Phantom1" } };
};

const asked: string[] = [];
const kamino = (
  txs: KaminoLoanTx[] | null,
  days: Awaited<ReturnType<KaminoLoans["days"]>> = [],
): KaminoLoans => ({
  transactions: async (market, obligation) => (asked.push(`${market}/${obligation}`), txs),
  days: async () => days,
});
const has = (obligation: string) => async () => ({ obligation }) as LendingPosition;

describe("readLoanHistory", () => {
  it("finds the loan by its owner and writes its history, named by Mercury's ticker", async () => {
    const s = await seed();
    asked.length = 0;
    const r = await readLoanHistory(
      {
        db: s.db,
        lending: { position: has("Obligation1") },
        loans: kamino([pledged]),
        market: "Market",
        usdcMint: USDC,
      },
      s.wallet,
    );
    expect(r).toEqual({ kind: "read", written: 1 });
    expect(asked).toEqual(["Market/Obligation1"]);
    const [feed] = await s.db.select().from(activities).where(eq(activities.walletId, s.wallet.walletId));
    expect([feed!.title, feed!.subtitle]).toEqual(["Added collateral", "10 TSLA at $240.10"]);
  });

  it("is nothing to read for a wallet with no loan", async () => {
    const s = await seed();
    const r = await readLoanHistory(
      {
        db: s.db,
        lending: { position: async () => null },
        loans: kamino([pledged]),
        market: "Market",
        usdcMint: USDC,
      },
      s.wallet,
    );
    expect(r).toEqual({ kind: "none" });
  });

  it("says Kamino couldn't be read, and writes nothing, so the next pass tries again", async () => {
    const s = await seed();
    const r = await readLoanHistory(
      { db: s.db, lending: { position: has("Ob") }, loans: kamino(null), market: "Market", usdcMint: USDC },
      s.wallet,
    );
    expect(r).toEqual({ kind: "unavailable" });
    expect(await s.db.select().from(loanEvents)).toEqual([]);
  });

  it("still writes the history when the daily closes can't be read, working each position forward", async () => {
    const s = await seed();
    const r = await readLoanHistory(
      {
        db: s.db,
        lending: { position: has("Ob") },
        loans: kamino([pledged], null),
        market: "Market",
        usdcMint: USDC,
      },
      s.wallet,
    );
    expect(r).toEqual({ kind: "read", written: 1 });
    const [row] = await s.db.select().from(loanEvents);
    expect(D(row!.collateralAfterUsd).toString()).toBe("2401");
  });
});
