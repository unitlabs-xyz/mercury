import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import type { TokenBalance } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import { cashFrom, valuePortfolio, type ValuableHolding } from "./value.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const price = (mint: string, perShare: string, changePct: string | null): TokenPrice => ({
  mint,
  usdPricePerToken: D(perShare),
  pricePerShare: D(perShare),
  changePct24h: changePct === null ? null : D(changePct),
  liquidityUsd: D("1000000"),
  multiplier: D(1),
  observedAt: null,
});

const holding = (shares: string, mints: readonly string[]): ValuableHolding => ({
  shares: D(shares),
  wrappers: mints.map((mint) => ({ mint })),
});

describe("cashFrom", () => {
  it("reads USDC out of the wallet at its own decimals", () => {
    const balances: TokenBalance[] = [{ mint: USDC, rawAmount: 14_250_000n, decimals: 6 }];
    expect(cashFrom(balances, USDC).toFixed(2)).toBe("14.25");
  });

  it("is zero when the wallet holds no USDC, which is not an error", () => {
    expect(cashFrom([], USDC)).toEqual(ZERO);
    expect(cashFrom([{ mint: "So11111", rawAmount: 5n, decimals: 9 }], USDC)).toEqual(ZERO);
  });
});

describe("valuePortfolio", () => {
  const board = new Map([["Xsc9", price("Xsc9", "100", "10")]]);

  it("values a holding at shares times the price of one share", () => {
    const v = valuePortfolio([holding("2.5", ["Xsc9"])], board, ZERO);
    expect(v.stocksUsd.toFixed(2)).toBe("250.00");
  });

  it("adds cash to reach the total, because the page's headline figure includes it", () => {
    const v = valuePortfolio([holding("2.5", ["Xsc9"])], board, D("14.25"));
    expect(v.cashUsd.toFixed(2)).toBe("14.25");
    expect(v.totalUsd.toFixed(2)).toBe("264.25");
  });

  it("totals cash alone when nothing is held", () => {
    const v = valuePortfolio([], board, D("14.25"));
    expect(v.stocksUsd).toEqual(ZERO);
    expect(v.totalUsd.toFixed(2)).toBe("14.25");
  });

  it("derives today's move from the 24h percentage rather than from history", () => {
    // 250 now at +10% means 227.27 yesterday, so 22.73 of today's value is the move.
    const v = valuePortfolio([holding("2.5", ["Xsc9"])], board, ZERO);
    expect(v.changeUsd.toFixed(2)).toBe("22.73");
  });

  it("skips a closed holding rather than valuing zero shares", () => {
    const v = valuePortfolio([holding("0", ["Xsc9"])], board, ZERO);
    expect(v.stocksUsd).toEqual(ZERO);
  });

  it("prices a holding from whichever of its wrappers the board answers for", () => {
    const v = valuePortfolio([holding("2", ["Unpriced", "Xsc9"])], board, ZERO);
    expect(v.stocksUsd.toFixed(2)).toBe("200.00");
  });

  it("values a holding no wrapper prices at zero rather than dropping it", () => {
    const v = valuePortfolio([holding("2", ["Unpriced"])], board, D("5"));
    expect(v.stocksUsd).toEqual(ZERO);
    expect(v.totalUsd.toFixed(2)).toBe("5.00");
  });

  it("treats a missing 24h percentage as no move, not as a crash", () => {
    const flat = new Map([["Xsc9", price("Xsc9", "100", null)]]);
    const v = valuePortfolio([holding("2", ["Xsc9"])], flat, ZERO);
    expect(v.changeUsd).toEqual(ZERO);
    expect(v.stocksUsd.toFixed(2)).toBe("200.00");
  });

  it("does not divide by zero when a token has fallen a clean 100%", () => {
    const wiped = new Map([["Xsc9", price("Xsc9", "0", "-100")]]);
    const v = valuePortfolio([holding("2", ["Xsc9"])], wiped, ZERO);
    expect(v.changeUsd).toEqual(ZERO);
  });
});
