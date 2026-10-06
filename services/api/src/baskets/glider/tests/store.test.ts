import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { JsonBasketStore } from "../store.js";
import { testDb } from "../../../db/testing.js";
import { users } from "../../../db/schema.js";

describe("JsonBasketStore", () => {
  it("persists an enrollment challenge across reads and records its result", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:pilot" }).returning();
    const store = new JsonBasketStore("postgres://unused", catalogJson, db);
    const id = await store.saveEnrollmentIntent({
      userId: user!.id, slug: "magnificent-seven", ownerAccountId: "solana:owner",
      strategyId: "strategy-1", expiresAt: new Date(Date.now() + 60_000),
      challenge: { flowId: "flow-1", accountIndex: "0", agentAccountId: "solana:agent", message: { kind: "solana-message", text: "Sign me" } },
    });
    expect(await store.enrollmentIntent(id)).toMatchObject({ userId: user!.id, slug: "magnificent-seven", portfolioId: null, challenge: { flowId: "flow-1" } });
    await store.completeEnrollmentIntent(id, "portfolio-1");
    expect(await store.enrollmentIntent(id)).toMatchObject({ portfolioId: "portfolio-1" });
  });
  it("resolves the curated catalog to Solana asset IDs", async () => {
    const baskets = await new JsonBasketStore("postgres://unused").load();
    expect(baskets).toHaveLength(22);
    expect(baskets.flatMap((basket) => basket.assets)).toHaveLength(206);
    const magnificentSeven = baskets.find((basket) => basket.slug === "magnificent-seven");
    expect(magnificentSeven?.assets).toContainEqual({
      ticker: "NVDA",
      assetId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo",
      weightBps: 1428,
    });
    expect(
      baskets.filter((basket) => basket.slug.endsWith("-tracker") && basket.name.endsWith("(Daily Variant)")),
    ).toHaveLength(4);
  });

  it.each([
    [
      "unknown ticker",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.allocations[0]!.ticker = "UNKNOWN";
      },
      /UNKNOWN/,
    ],
    [
      "repeated asset",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.allocations[1]!.ticker = catalog.strategies[0]!.allocations[0]!.ticker;
      },
      /duplicate Solana asset/,
    ],
    [
      "incorrect total",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.allocations[0]!.weightBps += 1;
      },
      /10,000 bps/,
    ],
    [
      "missing primary grouping",
      (catalog: typeof catalogJson) => {
        catalog.strategies[0]!.tags = ["shelf:featured"];
      },
      /primary theme or pros tag/,
    ],
  ])("rejects a catalog with %s", async (_case, mutate, expected) => {
    const catalog = structuredClone(catalogJson);
    mutate(catalog);
    await expect(new JsonBasketStore("postgres://unused", catalog).load()).rejects.toThrow(expected);
  });
});
