import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { fails, fakeFetch, jupQuote, NVDAX_MINT, USDC_MINT } from "../testing/index.js";
import { JupiterLite } from "./lite.js";

const buy = { side: "buy", mint: NVDAX_MINT, decimals: 8, amount: D(100) } as const;

describe("JupiterLite", () => {
  it("asks for USDC in and the wrapper out, in base units", async () => {
    let seen = "";
    const f = fakeFetch({ "/swap/v1/quote": jupQuote });
    const lite = new JupiterLite({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await lite.quote(buy);
    expect(seen).toContain(`inputMint=${USDC_MINT}`);
    expect(seen).toContain(`outputMint=${NVDAX_MINT}`);
    expect(seen).toContain("amount=100000000"); // $100 at USDC's six decimals
  });

  it("flips the legs for a sell and sizes the amount in the token's decimals", async () => {
    let seen = "";
    const f = fakeFetch({ "/swap/v1/quote": jupQuote });
    const lite = new JupiterLite({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await lite.quote({ side: "sell", mint: NVDAX_MINT, decimals: 8, amount: D("0.5") });
    expect(seen).toContain(`inputMint=${NVDAX_MINT}`);
    expect(seen).toContain(`outputMint=${USDC_MINT}`);
    expect(seen).toContain("amount=50000000"); // 0.5 at eight decimals
  });

  it("returns the amounts in human units, not base units", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": jupQuote }) });
    const quote = await lite.quote(buy);
    expect(quote).not.toBeNull();
    expect(quote!.inAmount.toFixed()).toBe("100");
    expect(quote!.outAmount.toFixed()).toBe(D(jupQuote.outAmount).div(D(10).pow(8)).toFixed());
  });

  it("carries the impact through as a Decimal, never a float", async () => {
    const withImpact = { ...jupQuote, priceImpactPct: "-0.0085123456789012345" };
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": withImpact }) });
    const quote = await lite.quote(buy);
    // Absolute, and not rounded through a JS number on the way.
    expect(quote!.priceImpact.toFixed()).toBe("0.0085123456789012345");
  });

  it("names the venues that would fill it", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": jupQuote }) });
    const quote = await lite.quote(buy);
    expect(quote!.routeLabels.length).toBeGreaterThan(0);
    expect(quote!.routeLabels).not.toContain(undefined);
  });

  it("says null when there is no route at this size, rather than throwing", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": fails(400) }) });
    expect(await lite.quote(buy)).toBeNull();
  });

  it("says null when the route returns nothing", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": { ...jupQuote, outAmount: "0" } }) });
    expect(await lite.quote(buy)).toBeNull();
  });

  it("refuses to build a transaction, and says where that lives", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({}) });
    await expect(lite.buildSwap("q", "owner")).rejects.toThrow(/JupiterUltra/);
  });
});
