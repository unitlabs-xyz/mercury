import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -30, toExpPos: 40 });

export { Decimal };

/** Construct a Decimal from anything we accept. Never accepts a bare float at a call site. */
export const D = (v: Decimal.Value): Decimal => new Decimal(v);

export const ZERO = D(0);
export const ONE = D(1);
export const HUNDRED = D(100);

/** A ratio expressed as a percentage, e.g. 0.0173 -> 1.73 */
export const asPct = (ratio: Decimal): Decimal => ratio.mul(HUNDRED);

/** A percentage expressed as a ratio, e.g. 1.73 -> 0.0173 */
export const fromPct = (pct: Decimal): Decimal => pct.div(HUNDRED);

/** Basis points from a ratio, for logging and evidence. 0.00173 -> 17.3 */
export const asBps = (ratio: Decimal): Decimal => ratio.mul(10_000);

export const isPositive = (v: Decimal): boolean => v.gt(ZERO);

/** Serialise for the wire. Money never crosses a boundary as a number. */
export const toWire = (v: Decimal): string => v.toFixed();

export const fromWire = (v: string): Decimal => D(v);
