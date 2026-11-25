import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import type { PriceBoard, TokenPrice } from "@mercury/market";
import { PortfolioSummary } from "@mercury/types";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  activities,
  disposals,
  earnEvents,
  historyJobs,
  instruments,
  loanAlerts,
  loanEvents,
  orders,
  portfolioSnapshots,
  positions,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import { readSummary, readSummaryRecords } from "./summary-queries.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const hour = (h: number) => new Date(`2026-11-23T${String(h).padStart(2, "0")}:00:00.000Z`);

const board: PriceBoard = {
  pricesFor: async (mints) =>
    new Map(
      mints.map((mint): [string, TokenPrice] => [
        mint,
        {
          mint,
          usdPricePerToken: D(200),
          pricePerShare: D(200),
          changePct24h: ZERO,
          liquidityUsd: D(1_000_000),
          multiplier: D(1),
          observedAt: hour(10),
        },
      ]),
    ),
};

/**
 * One person with a Mercury wallet, a linked wallet whose past is read, a
 * linked wallet still being read, and one they unlinked. Each has something
 * in every ledger the summary reads.
 */
const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:sum" }).returning();
  const userId = user!.id;
  const mercury = await mercuryWallet(db, userId, "Mercury");
  const linked = async (address: string, at: number, unlinked = false) => {
    const [w] = await db
      .insert(wallets)
      .values({
        userId,
        address,
        kind: "external",
        isPrimary: false,
        linkedAt: hour(at),
        unlinkedAt: unlinked ? hour(at + 1) : null,
      })
      .returning();
    return w!.id;
  };
  const read = await linked("Read", 1);
  const reading = await linked("Reading", 2);
  const gone = await linked("Gone", 0, true);
  await db.insert(historyJobs).values([
    { walletId: read, userId, status: "done" },
    { walletId: reading, userId, status: "running" },
  ]);

  const [instrument] = await db.insert(instruments).values({ ticker: "NVDA", name: "Nvidia" }).returning();
  await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 });

  for (const walletId of [mercury, read, reading, gone]) {
    await db.insert(portfolioSnapshots).values([
      // An older reading, which the summary must not pick.
      { userId, walletId, capturedAt: hour(8), totalUsd: "1", stocksUsd: "1", cashUsd: "0" },
      {
        userId,
        walletId,
        capturedAt: hour(9),
        readAt: hour(9),
        totalUsd: "1000",
        stocksUsd: "1000",
        cashUsd: "0",
        debtUsd: walletId === read ? "105" : "0",
        earnUsd: walletId === mercury ? "210" : null,
      },
    ]);
    // Two NVDA at $150 each, $100 of it estimated in the read linked wallet.
    await db.insert(positions).values({
      userId,
      walletId,
      instrumentId: instrument!.id,
      shares: "2",
      sharesWithBasis: "2",
      costBasisUsd: "300",
      referenceBasisUsd: "300",
      avgUnitCostUsd: "150",
      estimatedCostUsd: walletId === read ? "100" : "0",
    });
    await db.insert(activities).values({
      userId,
      walletId,
      kind: "dividend",
      title: "NVDA dividend",
      amountUsd: "4",
      txSignature: `div-${walletId}`,
      mint: NVDAX,
    });
  }
  await db.insert(orders).values({
    userId,
    walletId: mercury,
    instrumentId: instrument!.id,
    side: "sell",
    usdAmount: "100",
    decision: {},
    status: "filled",
    realisedPnlUsd: "12",
  });
  await db.insert(earnEvents).values({
    userId,
    walletId: mercury,
    kind: "deposit",
    usdcAmount: "200",
    vault: "Vault",
    txSignature: "earn-1",
    occurredAt: hour(5),
  });
  await db.insert(loanEvents).values({
    userId,
    walletId: read,
    kind: "borrow",
    usdAmount: "100",
    debtAfterUsd: "100",
    collateralAfterUsd: "400",
    txSignature: "loan-1",
    occurredAt: hour(5),
  });
  await db.insert(loanAlerts).values({ walletId: read, userId, health: "over_limit" });

  return { db, userId, mercury, read, reading, gone };
};

describe("readSummary", () => {
  it("adds up every followed wallet from what the database holds, and waits for the one still being read", async () => {
    const s = await seed();
    const summary = PortfolioSummary.parse(await readSummary(s.db, board, s.userId));

    // The unlinked wallet shows nowhere; the others in the order they are listed.
    expect(summary.wallets.map((w) => [w.address, w.history])).toEqual([
      ["Mercury", "ready"],
      ["Read", "ready"],
      ["Reading", "calculating"],
    ]);
    // Each wallet's newest reading, the oldest of them dated.
    expect(summary.netWorthUsd).toBe("3000");
    expect(summary.asOf).toBe(hour(9).toISOString());
    expect(summary.wallets[1]).toMatchObject({ debtUsd: "105", loanHealth: "over_limit" });
    expect(summary.wallets[0]!.loanHealth).toBeNull();

    // Two ready wallets, each up $100 on two shares; $12 realised in the Mercury wallet.
    expect(summary.pnl).toMatchObject({
      unrealisedUsd: "200",
      realisedUsd: "12",
      totalUsd: "212",
      estimatedCostUsd: "100",
    });
    // $10 earned over $200 in Earn, and $4 of dividends in each ready wallet.
    expect(summary.income).toEqual({
      earnUsd: "10",
      dividendsUsd: "8",
      totalUsd: "18",
      earnEstimated: false,
    });
    // $105 owed on $100 borrowed.
    expect(summary.loanInterestUsd).toBe("5");
    // Nothing repaid yet, so nothing paid.
    expect(summary.loanInterestPaidUsd).toBe("0");
    expect(summary.calculating).toBe(1);
  });

  it("counts what a liquidation realised with the sells', once its shares' cost is known", async () => {
    const s = await seed();
    // Kamino sold some of the read wallet's shares for $40 less than they had cost.
    await s.db.insert(loanEvents).values({
      userId: s.userId,
      walletId: s.read,
      kind: "liquidation",
      usdAmount: "300",
      tokensRaw: "200000000",
      debtAfterUsd: "100",
      collateralAfterUsd: "100",
      realisedPnlUsd: "-40",
      originSource: "chain",
      txSignature: "liq-1",
      occurredAt: hour(6),
    });
    // One whose cost is not known yet counts nothing.
    await s.db.insert(loanEvents).values({
      userId: s.userId,
      walletId: s.read,
      kind: "liquidation",
      usdAmount: "300",
      tokensRaw: "200000000",
      debtAfterUsd: "100",
      collateralAfterUsd: "100",
      originSource: "chain",
      txSignature: "liq-2",
      occurredAt: hour(7),
    });
    const summary = PortfolioSummary.parse(await readSummary(s.db, board, s.userId));
    expect(summary.pnl).toMatchObject({ realisedUsd: "-28", totalUsd: "172" });
  });

  it("counts what a sale outside Mercury realised, found in the linked wallet's history", async () => {
    const s = await seed();
    const [token] = await s.db.select().from(tokens);
    await s.db.insert(disposals).values({
      userId: s.userId,
      walletId: s.read,
      tokenId: token!.id,
      instrumentId: token!.instrumentId,
      tokenQty: 100_000_000n,
      shares: "1",
      kind: "chain",
      occurredAt: hour(6),
      realisedPnlUsd: "30",
    });
    const summary = PortfolioSummary.parse(await readSummary(s.db, board, s.userId));
    expect(summary.pnl).toMatchObject({ realisedUsd: "42" });
  });

  it("keeps a wallet whose past is read but not yet costed calculating, never a $0 P&L", async () => {
    const s = await seed();
    await s.db.update(historyJobs).set({ status: "read" }).where(eq(historyJobs.walletId, s.read));
    const summary = PortfolioSummary.parse(await readSummary(s.db, board, s.userId));

    expect(summary.wallets.map((w) => [w.address, w.history])).toEqual([
      ["Mercury", "ready"],
      ["Read", "calculating"],
      ["Reading", "calculating"],
    ]);
    expect(summary.calculating).toBe(2);
    // Only the Mercury wallet's figures count until the others are costed; still in net worth.
    expect(summary.pnl.unrealisedUsd).toBe("100");
    expect(summary.netWorthUsd).toBe("3000");
  });

  it("is empty for someone whose Mercury wallet is still being made", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:new" }).returning();
    const summary = PortfolioSummary.parse(await readSummary(db, board, user!.id));
    expect(summary).toMatchObject({ wallets: [], netWorthUsd: "0", asOf: null, calculating: 0 });
  });
});

describe("readSummaryRecords", () => {
  it("reads only the wallets asked for, and nothing of another person's", async () => {
    const s = await seed();
    const [other] = await s.db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
    const records = await readSummaryRecords(s.db, other!.id, [s.mercury]);
    expect(records.get(s.mercury)).toMatchObject({
      latest: null,
      realisedUsd: ZERO,
      earnNetDepositedUsd: null,
      loanLedger: [],
    });
  });

  it("reads nothing for no wallets", async () => {
    const s = await seed();
    expect((await readSummaryRecords(s.db, s.userId, [])).size).toBe(0);
  });
});
