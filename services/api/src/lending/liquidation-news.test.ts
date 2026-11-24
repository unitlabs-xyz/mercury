import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import { users, wallets } from "../db/schema.js";
import type { ChainLoanEvent } from "./chain-loan.js";
import { LIQUIDATION_NEWS_MS, liquidationNewsSince, liquidationNotice } from "./liquidation-news.js";

const NOW = new Date("2026-11-25T12:00:00.000Z");

const sold: ChainLoanEvent = {
  kind: "liquidation",
  signature: "Liq",
  occurredAt: NOW,
  usdAmount: D(570),
  ticker: "TSLA",
  tokensRaw: "400000000",
  priceUsd: D(150),
  debtAfterUsd: D(0),
  collateralAfterUsd: D(900),
  mint: "TSLAx",
  title: "Sold by Kamino",
  subtitle: "4 TSLA at $150.00 · repaid $570.00 of the loan",
};

describe("liquidationNewsSince", () => {
  const seed = async (linkedAt: Date) => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:news" }).returning();
    await mercuryWallet(db, user!.id);
    const [w] = await db
      .insert(wallets)
      .values({ userId: user!.id, address: "Phantom1", kind: "external", isPrimary: false, linkedAt })
      .returning();
    return { db, walletId: w!.id };
  };

  it("is the last day for a wallet followed longer than that", async () => {
    const s = await seed(new Date("2026-01-01T00:00:00.000Z"));
    expect(await liquidationNewsSince(s.db, s.walletId, NOW)).toEqual(
      new Date(NOW.getTime() - LIQUIDATION_NEWS_MS),
    );
  });

  it("starts at the link for a wallet linked today: what happened before is its past", async () => {
    const linked = new Date(NOW.getTime() - 60 * 60_000);
    const s = await seed(linked);
    expect(await liquidationNewsSince(s.db, s.walletId, NOW)).toEqual(linked);
  });
});

describe("liquidationNotice", () => {
  it("says what was sold and what it repaid", () => {
    const n = liquidationNotice(
      { event: sold, activityId: "a" },
      { kind: "privy_embedded", label: null, address: "x" },
    );
    expect(n.subject).toBe("Kamino sold collateral to repay your loan");
    expect(n.body).toContain("Kamino sold 4 TSLA at $150.00, which repaid $570.00");
  });

  it("names the linked wallet the loan was in", () => {
    const n = liquidationNotice(
      { event: sold, activityId: "a" },
      { kind: "external", label: "Phantom", address: "x" },
    );
    expect(n.subject).toBe("Kamino sold collateral to repay your loan (Phantom)");
    expect(n.body).toContain("Your loan in your linked wallet Phantom passed");
  });

  it("says only that collateral was sold where Kamino named only the debt", () => {
    const n = liquidationNotice(
      {
        event: {
          ...sold,
          ticker: null,
          tokensRaw: null,
          subtitle: "Collateral sold to repay $570.00 of the loan",
        },
        activityId: "a",
      },
      { kind: "privy_embedded", label: null, address: "x" },
    );
    expect(n.body).toContain("Kamino sold some of your collateral.");
  });
});
