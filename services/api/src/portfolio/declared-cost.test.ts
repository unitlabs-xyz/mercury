import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import { instruments, lots, tokens, users, wallets } from "../db/schema.js";
import { declareCost } from "./declared-cost.js";

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:declare" }).returning();
  const userId = user!.id;
  const mercury = await mercuryWallet(db, userId);
  const [w] = await db
    .insert(wallets)
    .values({ userId, address: "Phantom111", kind: "external", isPrimary: false, linkedAt: new Date() })
    .returning();
  const [tsla] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: tsla!.id, mint: "TSLAx", symbol: "TSLAx", issuer: "backed", decimals: 8 })
    .returning();
  const lot = async (walletId: string, over: Partial<typeof lots.$inferInsert> = {}) => {
    const [row] = await db
      .insert(lots)
      .values({
        userId,
        walletId,
        tokenId: token!.id,
        instrumentId: tsla!.id,
        tokenQty: 100_000_000n,
        shares: "1",
        unitCostUsd: "250",
        referencePriceUsd: "250",
        source: "chain",
        isEstimated: true,
        estimateSource: "market_price",
        ...over,
      })
      .returning();
    return row!.id;
  };
  const get = async (id: string) => (await db.select().from(lots).where(eq(lots.id, id)))[0]!;
  return { db, userId, mercury, linked: w!.id, lot, get };
};

describe("declareCost", () => {
  it("puts the person's figure on every estimated lot of the holding, exact from now on", async () => {
    const s = await seed();
    const a = await s.lot(s.linked);
    const b = await s.lot(s.linked, { estimateSource: "link_day_price", unitCostUsd: "300" });

    expect(await declareCost(s.db, { userId: s.userId, walletId: s.linked }, "TSLA", D("212.5"))).toEqual({
      kind: "set",
      lots: 2,
    });
    for (const id of [a, b]) {
      const lot = await s.get(id);
      expect(lot).toMatchObject({ source: "declared", isEstimated: false, estimateSource: null });
      expect(D(lot.unitCostUsd).toString()).toBe("212.5");
      // Its own reference, so none of it reads as a premium paid over the quote.
      expect(D(lot.referencePriceUsd!).toString()).toBe("212.5");
    }
  });

  it("never replaces an exact cost: a dollar swap read from the chain, or a purchase in Mercury", async () => {
    const s = await seed();
    const exact = await s.lot(s.linked, { isEstimated: false, estimateSource: null, unitCostUsd: "199" });
    const bought = await s.lot(s.linked, {
      source: "buy",
      isEstimated: false,
      estimateSource: null,
      unitCostUsd: "205",
    });
    const estimated = await s.lot(s.linked);
    await declareCost(s.db, { userId: s.userId, walletId: s.linked }, "TSLA", D(150));
    expect(D((await s.get(exact)).unitCostUsd).toString()).toBe("199");
    expect(D((await s.get(bought)).unitCostUsd).toString()).toBe("205");
    expect(D((await s.get(estimated)).unitCostUsd).toString()).toBe("150");
  });

  it("touches only the wallet it was asked for, and nobody else's", async () => {
    const s = await seed();
    const theirs = await s.lot(s.mercury);
    await s.lot(s.linked);
    await declareCost(s.db, { userId: s.userId, walletId: s.linked }, "TSLA", D(1));
    expect(await s.get(theirs)).toMatchObject({ source: "chain", isEstimated: true });

    expect(
      await declareCost(
        s.db,
        { userId: "00000000-0000-4000-8000-000000000000", walletId: s.mercury },
        "TSLA",
        D(1),
      ),
    ).toEqual({
      kind: "nothing_estimated",
    });
    expect(await s.get(theirs)).toMatchObject({ source: "chain", isEstimated: true });
  });

  it("says so when every cost on the holding is exact already", async () => {
    const s = await seed();
    await s.lot(s.linked, { isEstimated: false, estimateSource: null });
    expect(await declareCost(s.db, { userId: s.userId, walletId: s.linked }, "TSLA", D(1))).toEqual({
      kind: "nothing_estimated",
    });
  });

  it("knows no stock Mercury does not list", async () => {
    const s = await seed();
    expect(await declareCost(s.db, { userId: s.userId, walletId: s.linked }, "NOPE", D(1))).toEqual({
      kind: "unknown_stock",
    });
  });
});
