import { describe, expect, it } from "vitest";
import { basketPnlSub, stockPnlSub } from "./Summary";
import type { Model } from "./model";

const model = (over: Partial<Model> = {}): Model =>
  ({
    costBasis: 300,
    returnUsd: 99.54,
    returnPct: 33.18,
    marketReturnUsd: 104,
    marketReturnPct: 35.19,
    tradingCostUsd: 4.46,
    ...over,
  }) as Model;

/**
 * What the Stock P&L figure says underneath itself.
 *
 * The figure above it is what the stocks did; this line is what being in them
 * cost. They were one number, and that number reported a loss on a stock
 * sitting exactly where it was bought.
 */
describe("stockPnlSub", () => {
  it("names the move and what it cost to be there for it", () => {
    expect(stockPnlSub(model())).toBe("+35.19% · $4.46 fees and spread");
  });

  it("marks a fall as a fall and still charges for the trade", () => {
    expect(stockPnlSub(model({ marketReturnUsd: -20, marketReturnPct: -6.77 }))).toBe(
      "−6.77% · $4.46 fees and spread",
    );
  });

  it("says nothing about cost when there was effectively none", () => {
    expect(stockPnlSub(model({ tradingCostUsd: 0 }))).toBe("+35.19% on what you paid for them");
    // Rounding a tenth of a cent up to "$0.00 of fees" reads as a bug.
    expect(stockPnlSub(model({ tradingCostUsd: 0.004 }))).toBe("+35.19% on what you paid for them");
  });

  it("credits a fill that beat the quote rather than charging for it", () => {
    expect(stockPnlSub(model({ tradingCostUsd: -2.5 }))).toBe("+35.19% · $2.50 bought below the quote");
  });

  it("says there is no basis rather than claiming a return of nothing", () => {
    expect(stockPnlSub(model({ costBasis: 0 }))).toBe("+0.0% · No recorded stock cost basis");
  });
});

/**
 * What the Baskets figure says underneath itself.
 *
 * Its own figure rather than a clause on the stacked one above it, because a
 * basket's return is a total and cannot be split: Glider's fees and rebalance
 * spreads are inside it with nothing to separate them.
 */
describe("basketPnlSub", () => {
  const withBaskets = (over: Partial<Model> = {}): Model =>
    ({
      basketUsd: 857.5,
      basketCostBasis: 830,
      basketReturnUsd: 27.5,
      basketBasisIsComplete: true,
      ...over,
    }) as Model;

  it("names the dollars and the percentage of what went in", () => {
    expect(basketPnlSub(withBaskets())).toBe("+$27.50 · +3.3% all in");
  });

  it("marks a loss as a loss", () => {
    expect(basketPnlSub(withBaskets({ basketReturnUsd: -34.9, basketCostBasis: 280 }))).toBe(
      "−$34.90 · −12.5% all in",
    );
  });

  it("says when a basis understates what came back out", () => {
    // Something left in kind, so no dollar figure was recorded for it.
    expect(basketPnlSub(withBaskets({ basketBasisIsComplete: false }))).toBe(
      "+$27.50 · +3.3% all in, partial",
    );
  });

  it("says there is no basis rather than claiming a return of nothing", () => {
    expect(basketPnlSub(withBaskets({ basketCostBasis: 0 }))).toBe("No recorded basket cost");
  });
});
