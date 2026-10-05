import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { JsonBasketStore } from "../store.js";

describe("JsonBasketStore", () => {
  it("resolves the curated catalog to Solana asset IDs", async () => {
    const baskets = await new JsonBasketStore("postgres://unused").load();
    expect(baskets).toHaveLength(22);
    expect(baskets.flatMap((basket) => basket.assets)).toHaveLength(206);
    const magnificentSeven = baskets.find((basket) => basket.slug === "magnificent-seven");
    expect(magnificentSeven?.assets).toContainEqual({
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
  ])("rejects a catalog with %s", async (_case, mutate, expected) => {
    const catalog = structuredClone(catalogJson);
    mutate(catalog);
    await expect(new JsonBasketStore("postgres://unused", catalog).load()).rejects.toThrow(expected);
  });
});
