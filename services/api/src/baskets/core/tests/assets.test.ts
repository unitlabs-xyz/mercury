import { describe, expect, it } from "vitest";
import { BasketService } from "../service.js";
import type { BasketAssetSource, BasketAssetStore, BasketStore } from "../deps.js";
import type { BasketAsset } from "../primitives.js";

const asset = (ticker: string): BasketAsset => ({
  mint: `mint-${ticker}`,
  ticker,
  name: `${ticker} Inc`,
  symbol: `${ticker}on`,
  decimals: 9,
  logoUrl: null,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => asset(`T${i}`));

/** A catalogue in memory: the port is small enough that faking it is honest. */
const fakeStore = (initial: readonly BasketAsset[] = []) => {
  let held = [...initial];
  const store: BasketAssetStore = {
    all: () => Promise.resolve([...held].sort((a, b) => a.ticker.localeCompare(b.ticker))),
    count: () => Promise.resolve(held.length),
    replace: (assets) => {
      held = [...assets];
      return Promise.resolve(assets.length);
    },
  };
  return {
    store,
    get held() {
      return held;
    },
  };
};

const source = (assets: readonly BasketAsset[]): BasketAssetSource => ({
  list: () => Promise.resolve(assets),
});

const serviceWith = (assetSource: BasketAssetSource, assetStore: BasketAssetStore) =>
  new BasketService({ store: {} as BasketStore, assetSource, assetStore });

describe("syncAssets", () => {
  it("writes the catalogue when there is nothing to compare against", async () => {
    const kept = fakeStore();
    const result = await serviceWith(source(many(3)), kept.store).syncAssets();
    expect(result).toEqual({ written: 3, offered: 3, held: false });
    expect(kept.held.length).toBe(3);
  });

  /*
   * A pass removes assets as well as adding them, so a half-failed page would
   * empty the picker under somebody mid-way through choosing a basket. A thin
   * answer is treated as an outage, not as a mass delisting.
   */
  it("keeps the previous catalogue when the answer is too thin to believe", async () => {
    const kept = fakeStore(many(100));
    const result = await serviceWith(source(many(40)), kept.store).syncAssets();
    expect(result).toEqual({ written: 0, offered: 40, held: true });
    expect(kept.held.length).toBe(100);
  });

  it("accepts a dip inside the floor, because a delisting is real", async () => {
    const kept = fakeStore(many(100));
    const result = await serviceWith(source(many(85)), kept.store).syncAssets();
    expect(result).toEqual({ written: 85, offered: 85, held: false });
    expect(kept.held.length).toBe(85);
  });

  it("says so rather than throwing when no source is configured", async () => {
    const service = new BasketService({ store: {} as BasketStore, assetStore: fakeStore().store });
    await expect(service.syncAssets()).rejects.toThrow("asset source is not configured");
  });
});

describe("pickableAssets", () => {
  it("hands back the id a strategy holds an asset by, not the bare mint", async () => {
    const store = fakeStore([
      { ...asset("NVDA"), mint: "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo" },
    ]).store;
    const [nvda] = await serviceWith(source([]), store).pickableAssets();
    expect(nvda).toEqual({
      ticker: "NVDA",
      name: "NVDA Inc",
      // Both: the strategy is addressed by the id, the logo is keyed by the mint.
      mint: "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo",
      assetId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo",
      logoUrl: null,
    });
  });

  it("is empty before the first sync rather than throwing", async () => {
    expect(await serviceWith(source([]), fakeStore().store).pickableAssets()).toEqual([]);
  });
});
