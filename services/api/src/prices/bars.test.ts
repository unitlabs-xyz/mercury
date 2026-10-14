import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import { bucketOf, samplesFrom } from "./bars.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NVDAON = "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo";

const price = (mint: string, over: Partial<TokenPrice> = {}): TokenPrice => ({
  mint,
  usdPricePerToken: D("190.40"),
  pricePerShare: D("190.00"),
  changePct24h: null,
  liquidityUsd: D("3806032"),
  multiplier: D(1),
  observedAt: null,
  ...over,
});

describe("bucketOf", () => {
  const at = new Date("2026-10-14T13:47:31.250Z");

  it("puts a moment in the minute it belongs to", () => {
    expect(bucketOf(at, "1m").toISOString()).toBe("2026-10-14T13:47:00.000Z");
  });

  it("puts a moment in the hour it belongs to", () => {
    expect(bucketOf(at, "1h").toISOString()).toBe("2026-10-14T13:00:00.000Z");
  });

  it("puts a moment in its UTC day, not New York's", () => {
    // 01:30 UTC is still the previous evening on Wall Street. A day bucket is
    // a calendar day in UTC, the same as every other timestamp in the schema.
    expect(bucketOf(new Date("2026-10-14T01:30:00Z"), "1d").toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });
});

describe("samplesFrom", () => {
  const at = new Date("2026-10-14T13:47:31Z");
  const ids = new Map([
    [NVDAX, "token-nvdax"],
    [NVDAON, "token-nvdaon"],
  ]);

  it("records the pool's price per share, not per token", () => {
    // One NVDAx is 1.0017 shares since its last dividend, so the token trades
    // above the share. A series per token would step up at every dividend for
    // a move the stock never made.
    const board = new Map([
      [NVDAX, price(NVDAX, { usdPricePerToken: D("200.34"), multiplier: D("1.0017") })],
    ]);
    const [sample] = samplesFrom(board, ids, at);
    expect(sample!.marketPerShare.toFixed(6)).toBe(D("200.34").div("1.0017").toFixed(6));
    expect(sample!.multiplier.toString()).toBe("1.0017");
  });

  it("keeps the issuer's quote beside the pool's price", () => {
    const [sample] = samplesFrom(new Map([[NVDAX, price(NVDAX)]]), ids, at);
    expect(sample!.referencePerShare?.toString()).toBe("190");
    expect(sample!.marketPerShare.toString()).toBe("190.4");
  });

  it("records no quote where the issuer published none", () => {
    const [sample] = samplesFrom(new Map([[NVDAON, price(NVDAON, { pricePerShare: null })]]), ids, at);
    expect(sample!.referencePerShare).toBeNull();
  });

  it("stamps every sample with the moment it was taken, under its token's id", () => {
    const samples = samplesFrom(new Map([[NVDAX, price(NVDAX)]]), ids, at);
    expect(samples.map((s) => [s.tokenId, s.at.toISOString()])).toEqual([["token-nvdax", at.toISOString()]]);
  });

  it("skips a mint with no token row", () => {
    // The board can price a mint the six-hourly `stocks` job has not written
    // yet. With no token there is nothing to hang a bar on.
    const unknown = "Unknown1111111111111111111111111111111111111";
    expect(samplesFrom(new Map([[unknown, price(unknown)]]), ids, at)).toEqual([]);
  });

  it("skips a price with nothing to say about the pool", () => {
    // No pool price and no quote to stand in for it values the holding at
    // zero, and a zero in a price series is a cliff that never happened.
    const board = new Map([
      [NVDAON, price(NVDAON, { usdPricePerToken: D(0), multiplier: D(0), pricePerShare: null })],
    ]);
    expect(samplesFrom(board, ids, at)).toEqual([]);
  });
});
