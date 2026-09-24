import { Decimal, ZERO } from "../money.js";

export interface Constituent {
  readonly ticker: string;
  /** Basis points. Every constituent in a basket must sum to 10000. */
  readonly weightBps: number;
}

export interface Leg {
  readonly ticker: string;
  readonly weightBps: number;
  readonly usdAmount: Decimal;
}

export const TOTAL_BPS = 10_000;

export const assertWeightsSum = (constituents: readonly Constituent[]): void => {
  const total = constituents.reduce((a, c) => a + c.weightBps, 0);
  if (total !== TOTAL_BPS) throw new RangeError(`weights must sum to ${TOTAL_BPS}, got ${total}`);
};

/**
 * Split an amount across constituents by weight, in whole cents.
 *
 * Largest-remainder apportionment: floor every leg, then hand the leftover cents one
 * at a time to the legs with the largest fractional part. Ties break toward the larger
 * weight so the result is deterministic. The legs always sum to exactly the input.
 */
export function allocate(usdAmount: Decimal, constituents: readonly Constituent[]): Leg[] {
  assertWeightsSum(constituents);
  if (usdAmount.lte(ZERO)) throw new RangeError("amount must be positive");

  const totalCents = usdAmount.mul(100).toDecimalPlaces(0, Decimal.ROUND_DOWN);

  const raw = constituents.map((c, index) => {
    const exact = totalCents.mul(c.weightBps).div(TOTAL_BPS);
    const floor = exact.toDecimalPlaces(0, Decimal.ROUND_DOWN);
    return { index, ticker: c.ticker, weightBps: c.weightBps, floor, remainder: exact.sub(floor) };
  });

  const allocated = raw.reduce((a, r) => a.add(r.floor), ZERO);
  let leftover = totalCents.sub(allocated).toNumber();

  const order = [...raw].sort(
    (a, b) => b.remainder.comparedTo(a.remainder) || b.weightBps - a.weightBps || a.index - b.index,
  );
  const bonus = new Map<number, number>();
  for (const r of order) {
    if (leftover <= 0) break;
    bonus.set(r.index, 1);
    leftover -= 1;
  }

  return raw.map((r) => ({
    ticker: r.ticker,
    weightBps: r.weightBps,
    usdAmount: r.floor.add(bonus.get(r.index) ?? 0).div(100),
  }));
}

/** Current weights of a basket, for showing drift against target. Version one does not rebalance. */
export function currentWeights(
  values: readonly { ticker: string; valueUsd: Decimal }[],
): Map<string, number> {
  const total = values.reduce((a, v) => a.add(v.valueUsd), ZERO);
  const out = new Map<string, number>();
  if (total.isZero()) return out;
  for (const v of values)
    out.set(v.ticker, v.valueUsd.div(total).mul(TOTAL_BPS).toDecimalPlaces(0).toNumber());
  return out;
}
