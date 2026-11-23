import { describe, expect, it } from "vitest";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, users, wallets } from "../db/schema.js";
import { readBasketMovements } from "./queries.js";

const AT = new Date("2026-11-20T12:00:00.000Z");

describe("readBasketMovements", () => {
  it("reads one wallet's basket money, by direction, and notes an in-kind exit", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:bm" }).returning();
    const userId = user!.id;
    const mercury = await mercuryWallet(db, userId);
    const [linked] = await db
      .insert(wallets)
      .values({ userId, address: "Linked", kind: "external", isPrimary: false, linkedAt: AT })
      .returning();
    const row = (walletId: string, kind: string, amountUsd: string | null, sig: string) => ({
      userId,
      walletId,
      kind,
      occurredAt: AT,
      title: kind,
      amountUsd,
      basketPortfolioId: "portfolio-1",
      txSignature: sig,
      mint: `mint-${sig}`,
    });
    await db
      .insert(activities)
      .values([
        row(mercury, "basket_funding", "500", "a"),
        row(mercury, "liquidate_to_usdc", "120", "b"),
        row(mercury, "withdraw_in_kind", null, "c"),
        row(linked!.id, "transfer_out", "900", "d"),
      ]);

    const mine = await readBasketMovements(db, { userId, walletId: mercury });
    expect(mine.movements).toEqual([
      expect.objectContaining({ portfolioId: "portfolio-1", inward: true }),
      expect.objectContaining({ portfolioId: "portfolio-1", inward: false }),
    ]);
    expect(mine.movements.map((m) => m.amountUsd.toFixed())).toEqual(["500", "120"]);
    expect(mine.inKindExits).toEqual([{ portfolioId: "portfolio-1" }]);

    const theirs = await readBasketMovements(db, { userId, walletId: linked!.id });
    expect(theirs.movements.map((m) => m.amountUsd.toFixed())).toEqual(["900"]);
    expect(theirs.inKindExits).toEqual([]);
  });
});
