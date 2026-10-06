import { describe, expect, it } from "vitest";
import type { ManagedBasketTemplate } from "@mercury/types";
import { curatedShelves, discoveryLogoTickers } from "./catalog";
import { assetLogo } from "./AssetIcon";

const template = (slug: string, tags: ManagedBasketTemplate["tags"]): ManagedBasketTemplate => ({
  slug,
  kind: "managed_portfolio",
  provider: "glider",
  status: "candidate",
  tags,
  canEnroll: false,
  name: slug,
  description: "",
  strategyId: null,
  sourceStrategyId: "source",
  schedule: { type: "interval", frequency: "daily" },
  allocations: [],
  performance: null,
});

describe("basket discovery shelves", () => {
  it("uses catalog tags for theme counts and preserves curated investor order", () => {
    const shelves = curatedShelves([
      template("cathie-wood-tracker", ["shelf:pros"]),
      template("tech", ["theme:technology", "shelf:featured"]),
      template("nancy-pelosi-tracker", ["shelf:pros"]),
      template("energy", ["theme:energy"]),
    ]);

    expect(shelves.themes.find((theme) => theme.tag === "theme:technology")?.count).toBe(1);
    expect(shelves.pros.map((item) => item.slug)).toEqual(["nancy-pelosi-tracker", "cathie-wood-tracker"]);
    expect(shelves.featured.map((item) => item.slug)).toEqual(["tech"]);
  });

  it("loads logos for holdings in a selected theme, not only featured strategies", () => {
    const featured = {
      ...template("featured", ["shelf:featured"]),
      allocations: [{ ticker: "NVDA", mint: "mint", assetId: "asset", weightBps: 10_000 }],
    };
    const energy = {
      ...template("energy", ["theme:energy"]),
      allocations: [{ ticker: "VST", mint: "mint", assetId: "asset", weightBps: 10_000 }],
    };

    expect(discoveryLogoTickers([featured, energy], "theme:energy", false)).toEqual(["VST"]);
    expect(discoveryLogoTickers([featured, energy], null, true)).toEqual(["NVDA", "VST"]);
  });

  it("uses the icon for the Solana mint held by the strategy", () => {
    expect(
      assetLogo("ondo-mint", {
        logo: "https://example.test/blocked-primary.png",
        wrappers: [{ mint: "ondo-mint", icon: "https://example.test/ondo.png" }],
      }),
    ).toBe("https://example.test/ondo.png");
  });
});
