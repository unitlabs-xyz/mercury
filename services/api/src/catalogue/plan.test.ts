import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { CatalogueInstrument } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import { planCatalogue } from "./plan.js";

const NOW = new Date("2026-09-24T12:00:00Z");
const MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const wrapper = (over: Partial<CatalogueInstrument["wrappers"][number]> = {}) => ({
  mint: MINT,
  symbol: "NVDAx",
  issuer: "backed" as const,
  decimals: 8,
  name: "NVIDIA xStock",
  icon: "https://example.test/nvdax.png",
  liquidityUsd: D(2_800_000),
  holders: 108_418,
  netBuyers24h: 13,
  volume24hUsd: D(400_000),
  traders24h: 190,
  hasMarket: true,
  ...over,
});

const live = (over: Partial<CatalogueInstrument> = {}): CatalogueInstrument => ({
  ticker: "NVDA",
  wrappers: [wrapper()],
  ...over,
});

const priced = (over: Partial<TokenPrice> = {}): ReadonlyMap<string, TokenPrice> =>
  new Map([
    [
      MINT,
      {
        mint: MINT,
        usdPricePerToken: D("224.43901496255418"),
        pricePerShare: D("225.07"),
        changePct24h: D("-1.92"),
        liquidityUsd: D(2_800_000),
        multiplier: D("1.001701196801074"),
        observedAt: NOW,
        ...over,
      },
    ],
  ]);

describe("planCatalogue", () => {
  it("names an instrument from our own editorial, not from the token", () => {
    const plan = planCatalogue({ live: [live()], prices: priced(), stored: [], now: NOW });
    expect(plan.instruments[0]).toMatchObject({
      ticker: "NVDA",
      name: "Nvidia",
      sector: "Semiconductors",
      isTradable: true,
    });
    expect(plan.instruments[0]!.description).toContain("accelerators");
  });

  it("falls back to the issuer's name with the suffix stripped, for a ticker nobody has written up", () => {
    const plan = planCatalogue({
      live: [live({ ticker: "ASML", wrappers: [wrapper({ symbol: "ASMLx", name: "ASML Holding xStock" })] })],
      prices: new Map(),
      stored: [],
      now: NOW,
    });
    expect(plan.instruments[0]).toMatchObject({ ticker: "ASML", name: "ASML Holding", sector: "Other" });
  });

  it("files a fund under Funds from its own name, and guesses no sector for a company", () => {
    const plan = planCatalogue({
      live: [
        live({
          ticker: "SLV",
          wrappers: [
            wrapper({ symbol: "SLVon", issuer: "ondo", name: "iShares Silver Trust (Ondo Tokenized)" }),
          ],
        }),
        live({ ticker: "ACME", wrappers: [wrapper({ symbol: "ACMEx", name: "Acme Corp xStock" })] }),
      ],
      prices: new Map(),
      stored: [],
      now: NOW,
    });
    expect(plan.instruments.map((i) => [i.ticker, i.sector])).toEqual([
      ["SLV", "Funds"],
      ["ACME", "Other"],
    ]);
  });

  it("takes the logo from the Backed wrapper", () => {
    const plan = planCatalogue({ live: [live()], prices: priced(), stored: [], now: NOW });
    expect(plan.instruments[0]!.logoUrl).toBe("https://example.test/nvdax.png");
  });

  it("stores the live multiplier against the token", () => {
    const plan = planCatalogue({ live: [live()], prices: priced(), stored: [], now: NOW });
    expect(plan.tokens[0]).toMatchObject({ ticker: "NVDA", mint: MINT, issuer: "backed", decimals: 8 });
    expect(plan.tokens[0]!.multiplier).toBe("1.001701196801074");
  });

  it("keeps the stored multiplier when Jupiter has no price for the mint", () => {
    const plan = planCatalogue({
      live: [live()],
      prices: new Map(),
      stored: [{ mint: MINT, multiplier: "1.0009180758490996" }],
      now: NOW,
    });
    expect(plan.tokens[0]!.multiplier).toBe("1.0009180758490996");
    expect(plan.events).toEqual([]);
  });

  it("defaults a brand-new token with no price to a multiplier of one", () => {
    const plan = planCatalogue({ live: [live()], prices: new Map(), stored: [], now: NOW });
    expect(plan.tokens[0]!.multiplier).toBe("1");
  });

  it("writes an event when the multiplier moves, because that is a dividend", () => {
    const plan = planCatalogue({
      live: [live()],
      prices: priced(),
      stored: [{ mint: MINT, multiplier: "1.0009180758490996" }],
      now: NOW,
    });
    expect(plan.events).toEqual([
      {
        mint: MINT,
        oldMultiplier: "1.0009180758490996",
        newMultiplier: "1.001701196801074",
        kind: "dividend",
        observedAt: NOW,
      },
    ]);
  });

  it("writes no event when nothing moved, so a sync is idempotent", () => {
    const plan = planCatalogue({
      live: [live()],
      prices: priced(),
      stored: [{ mint: MINT, multiplier: "1.001701196801074" }],
      now: NOW,
    });
    expect(plan.events).toEqual([]);
  });

  it("calls a multiplier that more than doubles a split, not a dividend", () => {
    const plan = planCatalogue({
      live: [live()],
      prices: priced({ multiplier: D(4) }),
      stored: [{ mint: MINT, multiplier: "1" }],
      now: NOW,
    });
    expect(plan.events[0]!.kind).toBe("split");
  });

  it("will not guess at a multiplier that fell", () => {
    const plan = planCatalogue({
      live: [live()],
      prices: priced({ multiplier: D("0.9") }),
      stored: [{ mint: MINT, multiplier: "1" }],
      now: NOW,
    });
    expect(plan.events[0]!.kind).toBe("unknown");
  });

  it("marks a token unroutable when its pool has emptied", () => {
    const plan = planCatalogue({
      live: [live({ wrappers: [wrapper({ liquidityUsd: D(0) })] })],
      prices: priced({ liquidityUsd: D(0) }),
      stored: [],
      now: NOW,
    });
    expect(plan.tokens[0]!.isRoutable).toBe(false);
  });

  it("keeps both wrappers of an instrument, in one instrument row", () => {
    const ondo = wrapper({
      mint: "OnDoMiNt",
      symbol: "NVDAon",
      issuer: "ondo",
      decimals: 6,
      liquidityUsd: D(40_000),
    });
    const plan = planCatalogue({
      live: [live({ wrappers: [wrapper(), ondo] })],
      prices: priced(),
      stored: [],
      now: NOW,
    });
    expect(plan.instruments.length).toBe(1);
    expect(plan.tokens.map((t) => t.symbol).sort()).toEqual(["NVDAon", "NVDAx"]);
  });
});
