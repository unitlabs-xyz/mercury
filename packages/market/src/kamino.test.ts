import { describe, expect, it } from "vitest";
import { fails, fakeFetch, kaminoReserves } from "@mercury/chain/testing";
import { KaminoCredit, XSTOCKS_MARKET } from "./kamino.js";

describe("KaminoCredit", () => {
  it("reads the xStocks market, not the primary pool", async () => {
    let seen = "";
    const f = fakeFetch({ "/kamino-market/": kaminoReserves });
    const k = new KaminoCredit({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await k.current();
    expect(seen).toContain(XSTOCKS_MARKET);
    expect(seen).toContain("/reserves/metrics");
  });

  it("takes the borrow and supply rates from USDC", async () => {
    const reserves = [
      { liquidityToken: "USDC", maxLtv: "0", borrowApy: "0.0444", supplyApy: "0.00095" },
      { liquidityToken: "SPYx", maxLtv: "0.73", borrowApy: "0.09", supplyApy: "0.01" },
    ];
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": reserves }) });
    const market = await k.current();
    expect(market.borrowApy!.toFixed()).toBe("0.0444");
    expect(market.supplyApy!.toFixed()).toBe("0.00095");
  });

  it("lists the stock collateral, richest factor first", async () => {
    const reserves = [
      { liquidityToken: "HOODx", maxLtv: "0.3" },
      { liquidityToken: "SPYx", maxLtv: "0.73" },
      { liquidityToken: "QQQx", maxLtv: "0.7" },
    ];
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": reserves }) });
    const market = await k.current();
    expect(market.collateral.map((c) => c.symbol)).toEqual(["SPYx", "QQQx", "HOODx"]);
    expect(market.collateral[0]!.ticker).toBe("SPY");
    expect(market.collateral[0]!.maxLtv.toFixed()).toBe("0.73");
  });

  it("leaves out a reserve that cannot be borrowed against at all", async () => {
    const reserves = [
      { liquidityToken: "SPYx", maxLtv: "0.73" },
      { liquidityToken: "VIDAx", maxLtv: "0" },
      { liquidityToken: "USDC", maxLtv: "0.8" },
    ];
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": reserves }) });
    const market = await k.current();
    expect(market.collateral.map((c) => c.symbol)).toEqual(["SPYx"]);
  });

  it("reads the recorded response without inventing a shape", async () => {
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": kaminoReserves }) });
    const market = await k.current();
    expect(market.collateral.length).toBeGreaterThan(0);
    expect(market.collateral.every((c) => c.maxLtv.gt(0) && c.maxLtv.lte(1))).toBe(true);
  });

  it("says null for a rate USDC is missing, rather than zero", async () => {
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": [{ liquidityToken: "SPYx", maxLtv: "0.73" }] }) });
    const market = await k.current();
    expect(market.borrowApy).toBeNull();
    expect(market.supplyApy).toBeNull();
  });

  it("throws when Kamino is down", async () => {
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": fails(503) }) });
    await expect(k.current()).rejects.toThrow("503");
  });
});
