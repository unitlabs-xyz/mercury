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

  it("carries the route's own floor, not the amount it expects to deliver", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": jupQuote }) });
    const quote = await lite.quote(buy);
    // The captured response asks for 50 bps and answers exactly 50 bps under.
    expect(quote!.minOutAmount.toFixed()).toBe(D(jupQuote.otherAmountThreshold).div(D(10).pow(8)).toFixed());
    expect(quote!.minOutAmount.lt(quote!.outAmount)).toBe(true);
  });

  it("treats a quote that names no floor as promising only what it expects", async () => {
    const { otherAmountThreshold: _omitted, ...noFloor } = jupQuote;
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": noFloor }) });
    const quote = await lite.quote(buy);
    expect(quote!.minOutAmount.toFixed()).toBe(quote!.outAmount.toFixed());
  });

  it("asks for the slippage it was given, so policy decides it rather than the adapter", async () => {
    let seen = "";
    const f = fakeFetch({ "/swap/v1/quote": jupQuote });
    const lite = new JupiterLite({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await lite.quote({ ...buy, slippageBps: 17 });
    expect(seen).toContain("slippageBps=17");
  });

  it("builds from the quote it was handed, sending the payload back untouched", async () => {
    let body: Record<string, unknown> = {};
    const f = fakeFetch({
      "/swap/v1/swap": { swapTransaction: "BASE64TX", simulationError: null },
    });
    const lite = new JupiterLite({
      fetch: ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return f(input, init);
      }) as typeof fetch,
    });

    const txs = await lite.buildSwap({ quoteId: "q-1", raw: jupQuote }, "OWNER");

    expect(txs).toEqual(["BASE64TX"]);
    // Verbatim: re-serialising a quote is how a fill drifts from the price that was checked.
    expect(body.quoteResponse).toEqual(jupQuote);
    expect(body.userPublicKey).toBe("OWNER");
  });

  it("refuses to hand over a transaction Jupiter could not simulate", async () => {
    const lite = new JupiterLite({
      fetch: fakeFetch({
        "/swap/v1/swap": { swapTransaction: "BASE64TX", simulationError: { error: "InsufficientFunds" } },
      }),
    });
    await expect(lite.buildSwap({ quoteId: "q-1", raw: jupQuote }, "OWNER")).rejects.toThrow(
      /simulation failed/,
    );
  });

  it("will not build from a quote that carries no payload to redeem", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({}) });
    await expect(lite.buildSwap({ quoteId: "q-1", raw: null }, "OWNER")).rejects.toThrow(/no payload/);
  });
});
