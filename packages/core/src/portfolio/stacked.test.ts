import { describe, expect, it } from "vitest";
import { D, ZERO } from "../money.js";
import { stackedReturn } from "./cost-basis.js";

/** 1 share bought for $20.00 when the stock was quoted at $19.80, $0.23 of fee. */
const position = {
  sharesWithBasis: D(1),
  costBasisUsd: D("20.00"),
  referenceBasisUsd: D("19.80"),
  feeUsd: D("0.23"),
};

describe("stackedReturn", () => {
  it("reports no market move when the stock has not moved, whatever the trade cost", () => {
    const r = stackedReturn(position, D("19.80"));
    // The thing the old single figure got wrong: this read -$0.43 and called
    // it a loss on a stock sitting exactly where it was bought.
    expect(r.marketPnlUsd.toFixed(2)).toBe("0.00");
    expect(r.tradingCostUsd.toFixed(2)).toBe("0.43");
    expect(r.totalPnlUsd.toFixed(2)).toBe("-0.43");
  });

  it("separates a rise from what it cost to be there for it", () => {
    const r = stackedReturn(position, D("21.80"));
    expect(r.marketPnlUsd.toFixed(2)).toBe("2.00");
    expect(r.tradingCostUsd.toFixed(2)).toBe("0.43");
    expect(r.totalPnlUsd.toFixed(2)).toBe("1.57");
  });

  it("reports a real fall as a fall, not as a fall plus the fee", () => {
    const r = stackedReturn(position, D("17.80"));
    expect(r.marketPnlUsd.toFixed(2)).toBe("-2.00");
    expect(r.totalPnlUsd.toFixed(2)).toBe("-2.43");
  });

  it("sums to what the dollars say, so the split hides nothing", () => {
    const mark = D("21.80");
    const r = stackedReturn(position, mark);
    const byDollars = position.sharesWithBasis.mul(mark).sub(position.costBasisUsd).sub(position.feeUsd);
    expect(r.totalPnlUsd.toFixed(18)).toBe(byDollars.toFixed(18));
  });

  it("charges nothing for trading when the fill was at the quote and free", () => {
    const r = stackedReturn(
      { sharesWithBasis: D(2), costBasisUsd: D(40), referenceBasisUsd: D(40), feeUsd: ZERO },
      D(25),
    );
    expect(r.tradingCostUsd.toFixed()).toBe("0");
    expect(r.marketPnlUsd.toFixed()).toBe("10");
    expect(r.totalPnlUsd.toFixed()).toBe("10");
  });

  it("credits a fill below the quote rather than charging for it", () => {
    // A buy that beat the underlying quote is a negative cost of trading, and
    // clamping it at zero would quietly keep the benefit from the holder.
    const r = stackedReturn(
      { sharesWithBasis: D(1), costBasisUsd: D("19.50"), referenceBasisUsd: D("19.80"), feeUsd: ZERO },
      D("19.80"),
    );
    expect(r.tradingCostUsd.toFixed(2)).toBe("-0.30");
    expect(r.totalPnlUsd.toFixed(2)).toBe("0.30");
  });

  it("measures over the shares a lot covers, not over the whole holding", () => {
    // Half the holding arrived by transfer: it has no reference and no cost,
    // and it must not appear on either line.
    const r = stackedReturn(
      { sharesWithBasis: D(1), costBasisUsd: D(20), referenceBasisUsd: D(20), feeUsd: ZERO },
      D(30),
    );
    expect(r.marketPnlUsd.toFixed()).toBe("10");
  });

  it("is zero all round on a position with nothing proven behind it", () => {
    const r = stackedReturn(
      { sharesWithBasis: ZERO, costBasisUsd: ZERO, referenceBasisUsd: ZERO, feeUsd: ZERO },
      D(30),
    );
    expect(r.marketPnlUsd.toFixed()).toBe("0");
    expect(r.tradingCostUsd.toFixed()).toBe("0");
    expect(r.totalPnlUsd.toFixed()).toBe("0");
  });
});
