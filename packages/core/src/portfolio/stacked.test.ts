import { describe, expect, it } from "vitest";
import { D, ZERO, type Decimal } from "../money.js";
import { stackedReturn } from "./cost-basis.js";

/** 1 share bought for $20.00 when the stock was quoted at $19.80, $0.23 of fee. */
const position = {
  sharesWithBasis: D(1),
  costBasisUsd: D("20.00"),
  referenceBasisUsd: D("19.80"),
  feeUsd: D("0.23"),
};

/**
 * A pool and a quote that agree, which is what these cases mean unless they
 * say otherwise. `both` sets them apart.
 */
const at = (perShare: Decimal) => ({ marketPerShare: perShare, referencePerShare: perShare });
const both = (market: string, reference: string) => ({
  marketPerShare: D(market),
  referencePerShare: D(reference),
});

describe("stackedReturn", () => {
  it("reports no market move when the stock has not moved, whatever the trade cost", () => {
    const r = stackedReturn(position, at(D("19.80")));
    // The thing the old single figure got wrong: this read -$0.43 and called
    // it a loss on a stock sitting exactly where it was bought.
    expect(r.marketPnlUsd.toFixed(2)).toBe("0.00");
    expect(r.tradingCostUsd.toFixed(2)).toBe("0.43");
    expect(r.totalPnlUsd.toFixed(2)).toBe("-0.43");
  });

  it("separates a rise from what it cost to be there for it", () => {
    const r = stackedReturn(position, at(D("21.80")));
    expect(r.marketPnlUsd.toFixed(2)).toBe("2.00");
    expect(r.tradingCostUsd.toFixed(2)).toBe("0.43");
    expect(r.totalPnlUsd.toFixed(2)).toBe("1.57");
  });

  it("reports a real fall as a fall, not as a fall plus the fee", () => {
    const r = stackedReturn(position, at(D("17.80")));
    expect(r.marketPnlUsd.toFixed(2)).toBe("-2.00");
    expect(r.totalPnlUsd.toFixed(2)).toBe("-2.43");
  });

  it("sums to what the dollars say, so the split hides nothing", () => {
    const mark = D("21.80");
    const r = stackedReturn(position, at(mark));
    const byDollars = position.sharesWithBasis.mul(mark).sub(position.costBasisUsd).sub(position.feeUsd);
    expect(r.totalPnlUsd.toFixed(18)).toBe(byDollars.toFixed(18));
  });

  it("charges nothing for trading when the fill was at the quote and free", () => {
    const r = stackedReturn(
      { sharesWithBasis: D(2), costBasisUsd: D(40), referenceBasisUsd: D(40), feeUsd: ZERO },
      at(D(25)),
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
      at(D("19.80")),
    );
    expect(r.tradingCostUsd.toFixed(2)).toBe("-0.30");
    expect(r.totalPnlUsd.toFixed(2)).toBe("0.30");
  });

  it("measures over the shares a lot covers, not over the whole holding", () => {
    // Half the holding arrived by transfer: it has no reference and no cost,
    // and it must not appear on either line.
    const r = stackedReturn(
      { sharesWithBasis: D(1), costBasisUsd: D(20), referenceBasisUsd: D(20), feeUsd: ZERO },
      at(D(30)),
    );
    expect(r.marketPnlUsd.toFixed()).toBe("10");
  });

  it("is zero all round on a position with nothing proven behind it", () => {
    const r = stackedReturn(
      { sharesWithBasis: ZERO, costBasisUsd: ZERO, referenceBasisUsd: ZERO, feeUsd: ZERO },
      at(D(30)),
    );
    expect(r.marketPnlUsd.toFixed()).toBe("0");
    expect(r.tradingCostUsd.toFixed()).toBe("0");
    expect(r.totalPnlUsd.toFixed()).toBe("0");
  });
});

/**
 * The pool and the quote are not the same number.
 *
 * Measured across twenty xStocks on 9 October 2026 they differed by a median
 * 0.49%, as far apart as 9.4%. The position is worth what the pool says and
 * the stock moved by what the quote says, so everything between the two is a
 * cost of holding a wrapper rather than the share itself.
 */
describe("stackedReturn, when the pool and the quote disagree", () => {
  it("values the position at the pool and measures the move against the quote", () => {
    // The stock is exactly where it was bought ($19.80), but the token is
    // trading 1% under it. Nothing was gained or lost on the stock; a dollar
    // of the position's value is the discount it would be sold into.
    const r = stackedReturn(position, both("19.602", "19.80"));
    expect(r.marketPnlUsd.toFixed(2)).toBe("0.00");
    expect(r.totalPnlUsd.toFixed(3)).toBe("-0.628");
    // $0.20 of entry premium, $0.23 of fee, and $0.198 of exit discount.
    expect(r.tradingCostUsd.toFixed(3)).toBe("0.628");
  });

  it("still sums to the dollars when the two prices move apart", () => {
    const prices = both("21.50", "21.80");
    const r = stackedReturn(position, prices);
    const byDollars = position.sharesWithBasis
      .mul(prices.marketPerShare)
      .sub(position.costBasisUsd)
      .sub(position.feeUsd);
    expect(r.totalPnlUsd.toFixed(18)).toBe(byDollars.toFixed(18));
    expect(r.marketPnlUsd.sub(r.tradingCostUsd).toFixed(18)).toBe(byDollars.toFixed(18));
  });

  it("credits a pool trading above the quote, rather than charging for it", () => {
    // Selling into a premium is worth more than the share is quoted at, and
    // the cost of trading goes negative to say so.
    const r = stackedReturn(
      { sharesWithBasis: D(1), costBasisUsd: D("19.80"), referenceBasisUsd: D("19.80"), feeUsd: ZERO },
      both("20.00", "19.80"),
    );
    expect(r.marketPnlUsd.toFixed(2)).toBe("0.00");
    expect(r.tradingCostUsd.toFixed(2)).toBe("-0.20");
    expect(r.totalPnlUsd.toFixed(2)).toBe("0.20");
  });

  it("falls back to the pool when nothing quotes the underlying", () => {
    // No reference to measure against, so the move is reported in the token's
    // own terms and only the fee and the entry spread are charged for.
    const r = stackedReturn(position, { marketPerShare: D("21.80"), referencePerShare: null });
    expect(r.marketPnlUsd.toFixed(2)).toBe("2.00");
    expect(r.tradingCostUsd.toFixed(2)).toBe("0.43");
    expect(r.totalPnlUsd.toFixed(2)).toBe("1.57");
  });
});
