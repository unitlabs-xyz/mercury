import { describe, expect, it } from "vitest";
import { D, ZERO } from "../money.js";
import { EMPTY_OPEN, replayPosition, type Movement, type MovementIn, type MovementOut } from "./replay.js";

const JAN = new Date("2025-01-15T15:00:00Z");
const MAR = new Date("2025-03-12T15:00:00Z");

/** A purchase of `tokens` tokens at one share each, for `usd`, quoted at what was paid. */
const buy = (tokens: number, usd: number, over: Partial<MovementIn> = {}): MovementIn => ({
  kind: "in",
  tokenQty: BigInt(tokens),
  shares: D(tokens),
  costUsd: D(usd),
  referenceUsd: D(usd),
  feeUsd: ZERO,
  acquiredAt: JAN,
  isEstimated: false,
  ...over,
});

/** A dividend: shares and no tokens, at no cost. */
const dividend = (shares: string): MovementIn => buy(0, 0, { shares: D(shares) });

const out = (tokens: number): MovementOut => ({ kind: "out", tokenQty: BigInt(tokens) });

describe("replayPosition", () => {
  it("costs the shares held at what they cost, after a sell and another buy", () => {
    // The case that is wrong today: lifetime lots scaled down to the chain say
    // $266.67 for two shares that cost $300.
    const open = replayPosition([buy(2, 200), out(1), buy(1, 200)]);
    expect(open.shares.toFixed()).toBe("2");
    expect(open.costUsd.toFixed(2)).toBe("300.00");
  });

  it("starts fresh once the holding has been emptied", () => {
    const open = replayPosition([buy(1, 100, { acquiredAt: JAN }), out(1), buy(1, 200, { acquiredAt: MAR })]);
    expect(open.costUsd.toFixed(2)).toBe("200.00");
    expect(open.heldSince).toEqual(MAR);
  });

  it("scales the reference and the fee by the same fraction as the cost", () => {
    // If one were scaled and not the others, the shares that left would read as
    // a market move, and the lines of a stacked return would stop summing.
    const open = replayPosition([buy(4, 800, { referenceUsd: D(792), feeUsd: D("0.8") }), out(1)]);
    expect(open.costUsd.toFixed(2)).toBe("600.00");
    expect(open.referenceUsd.toFixed(2)).toBe("594.00");
    expect(open.feeUsd.toFixed(2)).toBe("0.60");
  });

  it("takes a dividend at no cost, so the average cost per share falls", () => {
    const open = replayPosition([buy(4, 800), dividend("0.4")]);
    expect(open.shares.toFixed()).toBe("4.4");
    expect(open.costUsd.toFixed(2)).toBe("800.00");
    expect(open.tokenQty).toBe(4n);
  });

  it("never goes below empty, whatever leaves", () => {
    expect(replayPosition([buy(1, 100), out(5)])).toEqual(EMPTY_OPEN);
    expect(replayPosition([out(1)])).toEqual(EMPTY_OPEN);
  });

  it("is held since the earliest purchase still open, not the latest recorded", () => {
    // An imported lot is recorded today and acquired long ago. Order of entry
    // is not order of purchase.
    const open = replayPosition([buy(1, 100, { acquiredAt: MAR }), buy(1, 100, { acquiredAt: JAN })]);
    expect(open.heldSince).toEqual(JAN);
  });

  it("stays estimated while an estimated lot is open, and clears once the holding is emptied", () => {
    const partly = replayPosition([buy(2, 100, { isEstimated: true }), out(1)]);
    expect(partly.isEstimated).toBe(true);
    const emptied = replayPosition([buy(2, 100, { isEstimated: true }), out(2), buy(1, 50)]);
    expect(emptied.isEstimated).toBe(false);
  });

  /*
   * One sequence, worked by hand. Average cost: a purchase adds its cost, a
   * dividend adds shares at no cost, and anything leaving takes the same
   * fraction of every figure as the fraction of tokens it took.
   */
  const SEQUENCE: readonly Movement[] = [
    buy(4, 800), //   4 tokens   4 shares    $800
    out(1), //        3          3           $600   (kept 3/4)
    buy(1, 300), //   4          4           $900
    dividend("0.4"), // 4        4.4         $900
    out(2), //        2          2.2         $450   (kept 2/4)
    out(2), //        0          0           $0     (emptied)
    buy(1, 100), //   1          1           $100
  ];
  const AFTER: readonly [tokens: bigint, shares: string, cost: string][] = [
    [4n, "4", "800.00"],
    [3n, "3", "600.00"],
    [4n, "4", "900.00"],
    [4n, "4.4", "900.00"],
    [2n, "2.2", "450.00"],
    [0n, "0", "0.00"],
    [1n, "1", "100.00"],
  ];

  it.each(AFTER.map((expected, i) => [i + 1, expected] as const))(
    "matches the hand-worked table after %i movements",
    (count, [tokens, shares, cost]) => {
      const open = replayPosition(SEQUENCE.slice(0, count));
      expect(open.tokenQty).toBe(tokens);
      expect(open.shares.toFixed()).toBe(shares);
      expect(open.costUsd.toFixed(2)).toBe(cost);
    },
  );
});
