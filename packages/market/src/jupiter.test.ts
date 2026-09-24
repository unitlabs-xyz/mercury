import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenRef, TokenRegistry } from "@mercury/chain";
import { fails, fakeFetch, jupPrice, NVDAX_MINT, SPYX_MINT } from "@mercury/chain/testing";
import { JupiterMarket } from "./jupiter.js";

const NVDAX: TokenRef = { mint: NVDAX_MINT, symbol: "NVDAx", ticker: "NVDA", issuer: "backed", decimals: 8 };
const NVDAON: TokenRef = { mint: "OnDoNvDaMiNtAdDrEsSfOrTeStSoNlY1111111111", symbol: "NVDAon", ticker: "NVDA", issuer: "ondo", decimals: 6 };

const registry = (refs: readonly TokenRef[]): TokenRegistry => ({
  wrappersFor: async (ticker) => refs.filter((r) => r.ticker === ticker),
  all: async () => refs,
  byMint: async (mint) => refs.find((r) => r.mint === mint) ?? null,
});

/** A price response with exactly the fields a test cares about. */
const priceOf = (mint: string, body: Record<string, unknown>) => ({ [mint]: body });

const recorded = jupPrice as Record<
  string,
  { usdPrice: number; stockData?: { price: number; updatedAt: string } } | null
>;

describe("JupiterMarket.pricesFor", () => {
  it("maps the recorded response onto the board", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    const board = await m.pricesFor([NVDAX_MINT]);
    const nvda = recorded[NVDAX_MINT]!;
    const price = board.get(NVDAX_MINT);
    expect(price!.usdPricePerToken.toFixed()).toBe(String(nvda.usdPrice));
    expect(price!.pricePerShare!.toFixed()).toBe(String(nvda.stockData!.price));
  });

  it("asks for every mint in one request", async () => {
    let seen = "";
    const f = fakeFetch({ "/price/v3": jupPrice });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await m.pricesFor([NVDAX_MINT, SPYX_MINT]);
    expect(seen).toContain(`${NVDAX_MINT},${SPYX_MINT}`);
  });

  it("does not call upstream for an empty list", async () => {
    const m = new JupiterMarket({ registry: registry([]), fetch: fakeFetch({}) });
    expect((await m.pricesFor([])).size).toBe(0);
  });

  it("uses newMultiplier once its effective timestamp has passed", async () => {
    const body = priceOf(NVDAX_MINT, {
      usdPrice: 224.43901496255418,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.0009180758490996,
        newMultiplier: 1.001701196801074,
        newMultiplierEffectiveAt: "2026-09-10T00:30:00Z",
      },
    });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": body }),
      now: () => Date.parse("2026-09-24T00:00:00Z"),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier.toFixed()).toBe("1.001701196801074");
  });

  it("uses the current multiplier until then", async () => {
    const body = priceOf(NVDAX_MINT, {
      usdPrice: 1,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.0009180758490996,
        newMultiplier: 1.001701196801074,
        newMultiplierEffectiveAt: "2026-09-10T00:30:00Z",
      },
    });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": body }),
      now: () => Date.parse("2026-09-01T00:00:00Z"),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier.toFixed()).toBe("1.0009180758490996");
  });

  it("says one for a token that has never paid a dividend", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 10, decimals: 8 }) }),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier).toEqual(D(1));
  });

  it("skips a mint Jupiter answered null for, rather than pricing it at zero", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": { [NVDAX_MINT]: null } }),
    });
    expect((await m.pricesFor([NVDAX_MINT])).size).toBe(0);
  });
});

describe("JupiterMarket.priceFor", () => {
  it("prices a ticker from its Backed wrapper", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAON, NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    const reference = await m.priceFor("NVDA");
    const nvda = recorded[NVDAX_MINT]!;
    expect(reference!.pricePerShare.toFixed()).toBe(String(nvda.stockData!.price));
    expect(reference!.observedAt).toEqual(new Date(nvda.stockData!.updatedAt));
    // Zero almost always: a dividend that has gone ex but is not yet in the
    // multiplier is the exception, and no upstream tells us about one.
    expect(reference!.pendingDividendNet).toEqual(D(0));
  });

  it("says null for a ticker it has never heard of", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect(await m.priceFor("NOPE")).toBeNull();
  });

  it("says null when there is no underlying quote, rather than using the pool price", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 224.4, decimals: 8 }) }),
    });
    expect(await m.priceFor("NVDA")).toBeNull();
  });

  it("throws when Jupiter is down, so the caller can fall back rather than price on nothing", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": fails(502) }) });
    await expect(m.priceFor("NVDA")).rejects.toThrow("502");
  });
});

describe("JupiterMarket as a MultiplierSource", () => {
  it("answers for a mint it can price", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect((await m.multiplierFor(NVDAX_MINT))!.gte(D(1))).toBe(true);
  });

  it("says null for a mint Jupiter does not know", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": {} }) });
    expect(await m.multiplierFor("NotAMint")).toBeNull();
  });

  it("cannot see a pause from a price, and says so rather than guessing", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect(await m.isPaused(NVDAX_MINT)).toBe(false);
  });
});
