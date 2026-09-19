import { describe, expect, it } from "vitest";
import { D } from "../money.js";
import {
  EMPTY_POSITION,
  applyBuy,
  applyDividend,
  applySell,
  avgUnitCost,
  positionFromLots,
  sharesGainedFromMultiplier,
  tokensToShares,
  unrealisedPnl,
} from "./cost-basis.js";

describe("cost basis", () => {
  it("counts shares, not tokens", () => {
    // 4.49374 NVDAx at a multiplier of 1.001701 is 4.5014 shares.
    expect(tokensToShares(D("4.49374"), D("1.001701196801074")).toFixed(4)).toBe("4.5014");
  });

  it("averages the cost of two buys", () => {
    let p = applyBuy(EMPTY_POSITION, D(2), D(400));
    p = applyBuy(p, D(2), D(500));
    expect(p.shares.toFixed()).toBe("4");
    expect(avgUnitCost(p).toFixed(2)).toBe("225.00");
  });

  it("leaves the average untouched when selling", () => {
    const p = applyBuy(EMPTY_POSITION, D(4), D(900));
    const { position, realisedPnlUsd } = applySell(p, D(1), D(250));
    expect(avgUnitCost(position).toFixed(2)).toBe("225.00");
    expect(realisedPnlUsd.toFixed(2)).toBe("25.00");
  });

  it("refuses to sell more than is held", () => {
    expect(() => applySell(applyBuy(EMPTY_POSITION, D(1), D(200)), D(2), D(400))).toThrow(RangeError);
  });

  describe("a dividend arriving through the multiplier", () => {
    it("adds shares for free, so the average cost per share falls", () => {
      const before = applyBuy(EMPTY_POSITION, D(100), D(22_236.50));
      expect(avgUnitCost(before).toFixed(4)).toBe("222.3650");

      // The multiplier moves 1.001701 -> 1.005701 on 99.83 tokens.
      const gained = sharesGainedFromMultiplier(D("99.83"), D("1.001701"), D("1.005701"));
      const after = applyDividend(before, gained);

      expect(after.shares.gt(before.shares)).toBe(true);
      expect(after.costBasisUsd.eq(before.costBasisUsd)).toBe(true);
      expect(avgUnitCost(after).lt(avgUnitCost(before))).toBe(true);
    });

    it("shows a gain rather than a phantom loss at an unchanged price", () => {
      const price = D(222.365);
      const before = applyBuy(EMPTY_POSITION, D(100), D(22_236.50));
      expect(unrealisedPnl(before, price).toFixed(2)).toBe("0.00");

      const after = applyDividend(before, sharesGainedFromMultiplier(D("99.83"), D("1.001701"), D("1.005701")));
      expect(unrealisedPnl(after, price).gt(0)).toBe(true);
    });

    it("ignores a multiplier that has not moved", () => {
      expect(sharesGainedFromMultiplier(D(100), D("1.0057"), D("1.0057")).isZero()).toBe(true);
    });
  });

  it("rebuilds a position from its lots", () => {
    const at = new Date("2026-09-19T00:00:00Z");
    const p = positionFromLots([
      { shares: D(2), unitCostUsd: D(200), acquiredAt: at, source: "buy", isEstimated: false },
      { shares: D(2), unitCostUsd: D(250), acquiredAt: at, source: "buy", isEstimated: false },
      { shares: D("0.4"), unitCostUsd: D(0), acquiredAt: at, source: "dividend", isEstimated: false },
    ]);
    expect(p.shares.toFixed(1)).toBe("4.4");
    expect(p.costBasisUsd.toFixed()).toBe("900");
    expect(avgUnitCost(p).toFixed(4)).toBe("204.5455");
  });
});
