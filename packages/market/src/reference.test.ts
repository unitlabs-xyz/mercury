import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import type { TokenRef, TokenRegistry } from "@mercury/chain";
import { BoardReference } from "./reference.js";
import type { PriceAsk, PriceBoard, TokenPrice } from "./ports.js";

const NVDAX: TokenRef = {
  mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  symbol: "NVDAx",
  ticker: "NVDA",
  issuer: "backed",
  decimals: 8,
};
const NVDAON: TokenRef = {
  mint: "OnDoNvDaMiNtAdDrEsSfOrTeStSoNlY1111111111",
  symbol: "NVDAon",
  ticker: "NVDA",
  issuer: "ondo",
  decimals: 6,
};

const registry = (refs: readonly TokenRef[]): TokenRegistry => ({
  wrappersFor: async (ticker) => refs.filter((r) => r.ticker === ticker),
  all: async () => refs,
  byMint: async (mint) => refs.find((r) => r.mint === mint) ?? null,
});

const price = (mint: string, pricePerShare: string | null): TokenPrice => ({
  mint,
  usdPricePerToken: D(10),
  pricePerShare: pricePerShare === null ? null : D(pricePerShare),
  changePct24h: null,
  liquidityUsd: ZERO,
  multiplier: D(1),
  observedAt: null,
});

/** A board that answers from a fixture and records how it was asked. */
const board = (prices: ReadonlyMap<string, TokenPrice>) => {
  const asks: (PriceAsk | undefined)[] = [];
  const mints: string[][] = [];
  const it: PriceBoard = {
    pricesFor: async (asked, ask) => {
      asks.push(ask);
      mints.push([...asked]);
      return new Map([...prices].filter(([mint]) => asked.includes(mint)));
    },
  };
  return { board: it, asks, mints };
};

describe("BoardReference", () => {
  it("prices one real share through the board it was given", async () => {
    const b = board(new Map([[NVDAX.mint, price(NVDAX.mint, "182.5")]]));
    const reference = new BoardReference({ registry: registry([NVDAX]), board: b.board });
    expect((await reference.priceFor("NVDA"))?.pricePerShare.toFixed()).toBe("182.5");
    expect(b.mints).toEqual([[NVDAX.mint]]);
  });

  it("holds the board to the age it was built with", async () => {
    const b = board(new Map([[NVDAX.mint, price(NVDAX.mint, "182.5")]]));
    const reference = new BoardReference({
      registry: registry([NVDAX]),
      board: b.board,
      maxAgeMs: 1_000,
    });
    await reference.priceFor("NVDA");
    // The number an order is checked against, so the ask carries its own
    // standard rather than inheriting whatever the board keeps for screens.
    expect(b.asks).toEqual([{ maxAgeMs: 1_000 }]);
  });

  it("leaves the board's own window alone when no age was named", async () => {
    const b = board(new Map([[NVDAX.mint, price(NVDAX.mint, "182.5")]]));
    await new BoardReference({ registry: registry([NVDAX]), board: b.board }).priceFor("NVDA");
    expect(b.asks).toEqual([undefined]);
  });

  it("prefers the Backed wrapper, whose pools are the deep ones", async () => {
    const b = board(
      new Map([
        [NVDAON.mint, price(NVDAON.mint, "181")],
        [NVDAX.mint, price(NVDAX.mint, "182.5")],
      ]),
    );
    // Ondo listed first, so a reader taking whatever came back first would
    // answer 181 and the preference would be untested.
    const reference = new BoardReference({ registry: registry([NVDAON, NVDAX]), board: b.board });
    expect((await reference.priceFor("NVDA"))?.pricePerShare.toFixed()).toBe("182.5");
  });

  it("says nothing for a ticker we list no wrapper for, and asks the board nothing", async () => {
    const b = board(new Map());
    const reference = new BoardReference({ registry: registry([NVDAX]), board: b.board });
    expect(await reference.priceFor("TSLA")).toBeNull();
    expect(b.mints).toEqual([]);
  });

  it("says nothing when the wrapper has no underlying quote", async () => {
    const b = board(new Map([[NVDAX.mint, price(NVDAX.mint, null)]]));
    const reference = new BoardReference({ registry: registry([NVDAX]), board: b.board });
    expect(await reference.priceFor("NVDA")).toBeNull();
  });

  it("stamps a price the upstream did not date with the time we read it", async () => {
    const b = board(new Map([[NVDAX.mint, price(NVDAX.mint, "182.5")]]));
    const reference = new BoardReference({
      registry: registry([NVDAX]),
      board: b.board,
      now: () => 1_760_000_000_000,
    });
    const reference_ = await reference.priceFor("NVDA");
    expect(reference_?.observedAt.getTime()).toBe(1_760_000_000_000);
    expect(reference_?.pendingDividendNet.toFixed()).toBe("0");
  });
});
