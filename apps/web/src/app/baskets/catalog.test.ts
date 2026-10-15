import { describe, expect, it } from "vitest";
import type { ShelfBasket } from "@mercury/view";
import { searchStrategies } from "./catalog";

const template = (
  slug: string,
  name: string,
  description: string,
  tickers: readonly string[],
  tags: ShelfBasket["tags"] = [],
) =>
  ({
    source: "curated",
    slug,
    name,
    description,
    tags,
    allocations: tickers.map((ticker) => ({ ticker, mint: "", assetId: "", weightBps: 1 })),
  }) as ShelfBasket;

const catalog = [
  template("magnificent-seven", "Mercury Solana - Magnificent Seven", "US market growth leaders.", [
    "NVDA",
    "META",
  ]),
  template("hard-money", "Mercury Solana - Hard Money", "Scarce assets such as precious metals.", [
    "GLD",
    "IBIT",
  ]),
  template("quantum", "Mercury Solana - Quantum", "Quantum computing.", ["IONQ"], ["theme:technology"]),
];

const names = new Map([
  ["NVDA", "Nvidia"],
  ["META", "Meta"],
  ["GLD", "Gold"],
]);

describe("searchStrategies", () => {
  it.each([
    { name: "an empty query keeps the whole catalog", query: "  ", expected: catalog.map((t) => t.slug) },
    { name: "a ticker finds the baskets holding it", query: "NVDA", expected: ["magnificent-seven"] },
    { name: "a company name resolves through instruments", query: "nvidia", expected: ["magnificent-seven"] },
    { name: "a strategy name matches", query: "hard money", expected: ["hard-money"] },
    { name: "the description matches", query: "precious metals", expected: ["hard-money"] },
    { name: "a theme tag matches without its prefix", query: "technology", expected: ["quantum"] },
    { name: "matching ignores case", query: "nVdA", expected: ["magnificent-seven"] },
    /* Substring matching, as the stock screener also does: "meta" is inside "metals". */
    {
      name: "a substring can match a word it sits inside",
      query: "meta",
      expected: ["magnificent-seven", "hard-money"],
    },
    { name: "an unknown term matches nothing", query: "tesla", expected: [] },
  ])("$name", ({ query, expected }) => {
    expect(searchStrategies(catalog, query, names).map((t) => t.slug)).toEqual(expected);
  });

  it("falls back to tickers when company names have not loaded", () => {
    expect(searchStrategies(catalog, "nvidia", new Map())).toEqual([]);
    expect(searchStrategies(catalog, "NVDA", new Map()).map((t) => t.slug)).toEqual(["magnificent-seven"]);
  });
});
