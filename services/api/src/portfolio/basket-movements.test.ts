import { describe, expect, it } from "vitest";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, users, wallets } from "../db/schema.js";
import { basketNetFunding, readBasketMovements } from "./queries.js";

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
    const row = (
      walletId: string,
      kind: string,
      amountUsd: string | null,
      sig: string,
      basket = "portfolio-1",
    ) => ({
      userId,
      walletId,
      kind,
      occurredAt: AT,
      title: kind,
      amountUsd,
      basketPortfolioId: basket,
      txSignature: sig,
      mint: `mint-${sig}`,
    });
    await db.insert(activities).values([
      row(mercury, "basket_funding", "500", "a"),
      row(mercury, "liquidate_to_usdc", "120", "b"),
      row(mercury, "withdraw_in_kind", null, "c"),
      // The linked wallet's own basket, a different one.
      row(linked!.id, "transfer_out", "900", "d", "portfolio-2"),
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

    // Its shares then moved in kind into the Mercury wallet: written in the Mercury wallet's feed,
    // and still something that left the linked wallet's basket in kind.
    await db.insert(activities).values(row(mercury, "withdraw_in_kind", null, "e", "portfolio-2"));
    const after = await readBasketMovements(db, { userId, walletId: linked!.id });
    expect(after.inKindExits).toEqual([{ portfolioId: "portfolio-2" }]);
  });
});

describe("basketNetFunding", () => {
  it("is what went into a basket less what came back, for the wallet that owns it", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:nf" }).returning();
    const userId = user!.id;
    await mercuryWallet(db, userId, "MercuryAddress");
    const [linked] = await db
      .insert(wallets)
      .values({ userId, address: "LinkedAddress", kind: "external", isPrimary: false, linkedAt: AT })
      .returning();
    const move = (kind: string, amountUsd: string | null, sig: string, walletId = linked!.id) => ({
      userId,
      walletId,
      kind,
      occurredAt: AT,
      title: kind,
      amountUsd,
      basketPortfolioId: "p-1",
      txSignature: sig,
      mint: `mint-${sig}`,
    });
    await db
      .insert(activities)
      .values([move("basket_funding", "600", "a"), move("liquidate_to_usdc", "100", "b")]);

    expect((await basketNetFunding(db, userId, "LinkedAddress", "p-1"))?.toFixed()).toBe("500");
    // Not this person's wallet, or not this basket: nothing to split.
    expect(await basketNetFunding(db, userId, "SomeoneElse", "p-1")).toBeNull();
    expect(await basketNetFunding(db, userId, "LinkedAddress", "p-9")).toBeNull();

    // Once something left in kind, no dollar figure says what: not known any more.
    await db.insert(activities).values(move("withdraw_in_kind", null, "c"));
    expect(await basketNetFunding(db, userId, "LinkedAddress", "p-1")).toBeNull();
  });
});
