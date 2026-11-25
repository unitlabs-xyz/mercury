import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  activities,
  disposals,
  historyJobs,
  instruments,
  loanEvents,
  lots,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import { liquidationPnl, settleLiquidations } from "./liquidation-pnl.js";

const ME = "Phantom1111111111111111111111111111111111111";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const whole = (n: number) => BigInt(n) * 100_000_000n;
const day = (n: number) => new Date(Date.UTC(2026, 5, n));

describe("liquidationPnl", () => {
  it("is what Kamino took the shares for, less their share of the cost", () => {
    // 10 held at $2,000; Kamino took 4 for $600: they had cost $800.
    expect(liquidationPnl(D(600), whole(4), { tokenQty: whole(10), costUsd: D(2000) })!.toString()).toBe(
      "-200",
    );
  });

  it("says nothing when Kamino took more than the records hold a cost for", () => {
    expect(liquidationPnl(D(600), whole(4), { tokenQty: whole(3), costUsd: D(600) })).toBeNull();
    expect(liquidationPnl(D(600), whole(4), { tokenQty: 0n, costUsd: D(0) })).toBeNull();
  });
});

describe("settleLiquidations", () => {
  const seed = async (status: "read" | "done") => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:liquidated" }).returning();
    const userId = user!.id;
    await mercuryWallet(db, userId);
    const [w] = await db
      .insert(wallets)
      .values({ userId, address: ME, kind: "external", isPrimary: false, linkedAt: day(1) })
      .returning();
    const walletId = w!.id;
    await db.insert(historyJobs).values({ walletId, userId, status });
    const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
    const [token] = await db
      .insert(tokens)
      .values({ instrumentId: instrument!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 })
      .returning();
    const base = { userId, walletId, tokenId: token!.id, instrumentId: instrument!.id, feeUsd: "0" };

    // Bought 10 at $200 on day 2, and 5 more at $260 on day 10, after the liquidation.
    await db.insert(lots).values([
      { ...base, tokenQty: whole(10), shares: "10", unitCostUsd: "200", acquiredAt: day(2), source: "chain" },
      { ...base, tokenQty: whole(5), shares: "5", unitCostUsd: "260", acquiredAt: day(10), source: "chain" },
    ]);
    // Position-sync took the 4 out when it saw them gone, after Kamino sold them.
    await db.insert(disposals).values({
      userId,
      walletId,
      tokenId: token!.id,
      instrumentId: instrument!.id,
      tokenQty: whole(4),
      shares: "4",
      kind: "transfer_out",
      occurredAt: day(5),
    });
    // Kamino sold 4 for $600 on day 5: read from the loan's history, with its feed row.
    const [liq] = await db
      .insert(loanEvents)
      .values({
        userId,
        walletId,
        kind: "liquidation",
        usdAmount: "600",
        ticker: "TSLA",
        tokensRaw: whole(4).toString(),
        debtAfterUsd: "300",
        collateralAfterUsd: "900",
        priceUsd: "150",
        originSource: "chain",
        txSignature: "Liq1",
        occurredAt: new Date(day(5).getTime() - 60_000),
      })
      .returning();
    await db.insert(activities).values({
      userId,
      walletId,
      kind: "liquidation",
      occurredAt: liq!.occurredAt,
      title: "Sold by Kamino",
      subtitle: "4 TSLA at $150.00",
      amountUsd: "600",
      refTable: "loan_event",
      refId: liq!.id,
      txSignature: "Liq1",
      mint: TSLAX,
    });
    const realised = async () =>
      (await db.select().from(loanEvents).where(eq(loanEvents.id, liq!.id)))[0]!.realisedPnlUsd;
    return { db, walletId, realised };
  };

  it("books a liquidation as a sale at Kamino's price, against the cost of the shares just before it", async () => {
    const s = await seed("done");
    expect(await settleLiquidations(s.db, s.walletId)).toBe(1);
    // $600 for 4 of 10 shares that had cost $2,000: a $200 loss. The later buy and the
    // departure position-sync wrote for it play no part.
    expect(D((await s.realised())!).toString()).toBe("-200");
  });

  it("waits while a linked wallet's past is still being costed, rather than guess", async () => {
    const s = await seed("read");
    expect(await settleLiquidations(s.db, s.walletId)).toBe(0);
    expect(await s.realised()).toBeNull();
  });

  it("writes each liquidation once", async () => {
    const s = await seed("done");
    await settleLiquidations(s.db, s.walletId);
    expect(await settleLiquidations(s.db, s.walletId)).toBe(0);
    expect(D((await s.realised())!).toString()).toBe("-200");
  });
});
