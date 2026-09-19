import { describe, expect, it } from "vitest";
import { D } from "@harbor/core";
import { FixtureQuoteSource, FixtureRegistry } from "./adapters.js";
import { FIXTURE_TOKENS } from "./data.js";

const registry = new FixtureRegistry();
const quotes = new FixtureQuoteSource();

describe("fixture data", () => {
  it("has at least two issuers for every ticker it claims", async () => {
    const tickers = new Set(FIXTURE_TOKENS.map((t) => t.ticker));
    for (const ticker of tickers) {
      const wrappers = await registry.wrappersFor(ticker);
      expect(wrappers.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("carries a multiplier of at least one for every token", () => {
    for (const t of FIXTURE_TOKENS) expect(D(t.multiplier).gte(1)).toBe(true);
  });

  it("round-trips a quote back to the measured price per share", async () => {
    for (const t of FIXTURE_TOKENS) {
      const q = await quotes.quote({ side: "buy", mint: t.mint, decimals: t.decimals, amount: D(1000) });
      expect(q).not.toBeNull();
      const perToken = q!.inAmount.div(q!.outAmount);
      expect(perToken.div(t.multiplier).toFixed(2)).toBe(D(t.pricePerShare).toFixed(2));
    }
  });

  it("keeps the measured 85% impact on Ondo's Nvidia", async () => {
    const ondo = FIXTURE_TOKENS.find((t) => t.symbol === "NVDAon")!;
    const q = await quotes.quote({ side: "buy", mint: ondo.mint, decimals: ondo.decimals, amount: D(1000) });
    expect(q!.priceImpact.mul(100).toFixed(0)).toBe("85");
  });

  it("returns null for an unknown mint rather than guessing", async () => {
    expect(await quotes.quote({ side: "buy", mint: "nope", decimals: 6, amount: D(100) })).toBeNull();
  });
});
