import { describe, expect, it } from "vitest";
import { stockPnlSub } from "./Summary";
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
    expect(stockPnlSub(model())).toBe("+35.19% · less $4.46 of fees and spread");
  });

  it("marks a fall as a fall and still charges for the trade", () => {
    expect(stockPnlSub(model({ marketReturnUsd: -20, marketReturnPct: -6.77 }))).toBe(
      "−6.77% · less $4.46 of fees and spread",
    );
  });

  it("says nothing about cost when there was effectively none", () => {
    expect(stockPnlSub(model({ tradingCostUsd: 0 }))).toBe("+35.19% on what you paid for them");
    // Rounding a tenth of a cent up to "$0.00 of fees" reads as a bug.
    expect(stockPnlSub(model({ tradingCostUsd: 0.004 }))).toBe("+35.19% on what you paid for them");
  });

  it("credits a fill that beat the quote rather than charging for it", () => {
    expect(stockPnlSub(model({ tradingCostUsd: -2.5 }))).toBe(
      "+35.19% · plus $2.50 you bought below the quote",
    );
  });

  it("says there is no basis rather than claiming a return of nothing", () => {
    expect(stockPnlSub(model({ costBasis: 0 }))).toBe("+0.0% · No recorded stock cost basis");
  });
});
