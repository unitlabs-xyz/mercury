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

/**
 * n weights totalling exactly `total`, remainder on the last — which is how
 * the curated catalogue stores them (Magnificent Seven is 1428 × 6 + 1432).
 *
 * `total` is what a held weight leaves behind, so levelling around a lock is
 * the same arithmetic rather than a second copy of it.
 */
export const equalWeights = (count: number, total: number = TOTAL_BPS): number[] => {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count must be a positive integer");
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - each * (count - 1) : each));
};

/**
 * Glider's measured limits: 1–50 assets, weights totalling exactly 100.00.
 * `unknown_asset` is ours — its `validate` accepts a strategy holding BONK,
 * so the catalogue is the only tradability signal we have.
 */
export type DraftProblem =
  | "name_required"
  | "name_too_long"
  | "no_assets"
  | "too_many_assets"
  | "duplicate_asset"
  | "unknown_asset"
  | "weights_must_total_10000";

export interface BasketDraft {
  readonly name: string;
  readonly description: string;
  /** No ticker: it is the catalogue's to say, resolved by `assetId`. */
  readonly assets: readonly { assetId: string; weightBps: number }[];
}

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
const ASSETS_MAX = 50;

/** On its own because a rename must not re-check assets that are already stored. */
export const nameProblem = (name: string): DraftProblem | null =>
  name.trim() === "" ? "name_required" : name.trim().length > NAME_MAX ? "name_too_long" : null;

/** Shared by the composer and the API, so a form cannot offer what the server refuses. */
export const problemWith = (draft: BasketDraft, holdable: ReadonlySet<string>): DraftProblem | null => {
  /* What is missing, in the order somebody would fix it: the stocks, then the
     name, then the weights. A composer reports only the first. */
  if (draft.assets.length === 0) return "no_assets";
  if (draft.assets.length > ASSETS_MAX) return "too_many_assets";
  const ids = draft.assets.map((asset) => asset.assetId);
  if (new Set(ids).size !== ids.length) return "duplicate_asset";
  if (ids.some((id) => !holdable.has(id))) return "unknown_asset";
  const named = nameProblem(draft.name);
  if (named !== null) return named;
  const total = draft.assets.reduce((sum, asset) => sum + asset.weightBps, 0);
  return total === TOTAL_BPS ? null : "weights_must_total_10000";
};
