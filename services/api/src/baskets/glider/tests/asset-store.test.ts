import { describe, expect, it } from "vitest";
import { testDb } from "../../../db/testing.js";
import { PgBasketAssetStore } from "../asset-store.js";
import type { BasketAsset } from "../../core/primitives.js";

const asset = (ticker: string): BasketAsset => ({
  mint: `mint-${ticker}`,
  ticker,
  name: `${ticker} Inc`,
  symbol: `${ticker}on`,
  decimals: 9,
  logoUrl: null,
});

describe("PgBasketAssetStore", () => {
  it("replaces the catalogue, dropping whatever the pass did not mention", async () => {
    const store = new PgBasketAssetStore(await testDb());
    expect(await store.replace([asset("A"), asset("B"), asset("C")])).toBe(3);

    await store.replace([asset("A"), asset("B")]);
    expect((await store.all()).map((a) => a.ticker)).toEqual(["A", "B"]);
  });

  it("updates a row in place when the mint is already known", async () => {
    const store = new PgBasketAssetStore(await testDb());
    await store.replace([asset("NVDA")]);
    await store.replace([{ ...asset("NVDA"), name: "Nvidia Corp", logoUrl: "https://logo" }]);

    const [nvda] = await store.all();
    expect(nvda).toMatchObject({ ticker: "NVDA", name: "Nvidia Corp", logoUrl: "https://logo" });
    expect(await store.count()).toBe(1);
  });

  /* The picker is a list somebody scans, so the order is the store's job. */
  it("reads back in ticker order", async () => {
    const store = new PgBasketAssetStore(await testDb());
    await store.replace([asset("TSLA"), asset("AAPL"), asset("NVDA")]);
    expect((await store.all()).map((a) => a.ticker)).toEqual(["AAPL", "NVDA", "TSLA"]);
  });

  it("counts nothing before the first sync", async () => {
    expect(await new PgBasketAssetStore(await testDb()).count()).toBe(0);
  });
});
