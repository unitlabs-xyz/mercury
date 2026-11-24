import { D, type Decimal, ZERO } from "@mercury/core";
import type { EstimateSource } from "@mercury/types";
// The floor below which a rise is arithmetic, not a dividend: position-sync's own, so the two agree.
import { DIVIDEND_FLOOR } from "../portfolio/reconcile.js";

/** USDC and USDT: dollars, so a swap paid in either is an exact cost. Mainnet mints. */
export const DOLLAR_MINTS: ReadonlySet<string> = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);
/** Both carry six decimals. */
const DOLLAR_DECIMALS = 6;

/** Where an estimated cost came from: the wire's own list, so the two cannot drift. Null on a lot is exact. */
export type { EstimateSource };

/** What one arrival's shares cost, each. */
export interface ArrivalCost {
  readonly unitCostUsd: Decimal;
  /** The share's quote at the time, what "did the stock move" is measured from. Null when not known. */
  readonly referencePriceUsd: Decimal | null;
  readonly estimateSource: EstimateSource | null;
}

/** A movement of one token, in the order it happened, ready to replay. */
export interface CostMovement {
  readonly kind: "in" | "out";
  readonly amountRaw: bigint;
  readonly at: Date;
  /** The multiplier in force at the time: one token is this many shares. */
  readonly multiplier: Decimal;
  /** For an arrival, its cost. */
  readonly cost?: ArrivalCost;
}

/** A lot left after the replay: what is still held, and what it cost. */
export interface PlannedLot {
  readonly tokenQty: bigint;
  /** Tokens times the multiplier at arrival. A dividend since is its own lot. */
  readonly shares: Decimal;
  readonly unitCostUsd: Decimal;
  readonly referencePriceUsd: Decimal | null;
  readonly estimateSource: EstimateSource | null;
  readonly acquiredAt: Date;
  /** The multiplier it arrived at, for the dividends since. */
  readonly multiplier: Decimal;
}

const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

/**
 * The exact cost per share of a swap paid in dollars: the USDC or USDT that
 * left the wallet in the same transaction, over the shares that arrived.
 * Null when what left was not dollars, or no shares arrived.
 */
export const dollarCost = (
  counterMint: string | null,
  counterAmountRaw: bigint | null,
  shares: Decimal,
): Decimal | null => {
  if (counterMint === null || counterAmountRaw === null || !DOLLAR_MINTS.has(counterMint)) return null;
  if (!shares.gt(ZERO)) return null;
  return scaled(counterAmountRaw, DOLLAR_DECIMALS).div(shares);
};

/**
 * One token account's movements replayed oldest first, at average cost, into
 * the lots still held: Mercury's own rule (`replayPosition`), applied to a
 * linked wallet's past.
 *
 * An arrival is a lot at its cost. A departure takes its share of every open
 * lot, so the average cost of what remains does not change and the cost of
 * what left goes with it. Counted in tokens, which are exact; a lot's shares
 * follow its tokens at the multiplier it arrived at.
 *
 * `opening`: the tokens already held before the oldest movement read, where
 * the walk back stopped at its cap rather than at an empty balance. Priced
 * at the price then and marked estimated, as the spec says.
 */
export const replayAccount = (
  movements: readonly CostMovement[],
  decimals: number,
  opening?: {
    readonly amountRaw: bigint;
    readonly at: Date;
    readonly multiplier: Decimal;
    readonly cost: ArrivalCost;
  },
): readonly PlannedLot[] => {
  const open: { tokenQty: bigint; lot: Omit<PlannedLot, "tokenQty" | "shares"> }[] = [];
  const arrive = (raw: bigint, at: Date, multiplier: Decimal, cost: ArrivalCost) => {
    if (raw <= 0n) return;
    open.push({
      tokenQty: raw,
      lot: {
        unitCostUsd: cost.unitCostUsd,
        referencePriceUsd: cost.referencePriceUsd,
        estimateSource: cost.estimateSource,
        acquiredAt: at,
        multiplier,
      },
    });
  };

  if (opening !== undefined) arrive(opening.amountRaw, opening.at, opening.multiplier, opening.cost);

  for (const m of movements) {
    if (m.kind === "in") {
      if (m.cost === undefined) throw new Error("an arrival reached the replay without a cost");
      arrive(m.amountRaw, m.at, m.multiplier, m.cost);
      continue;
    }
    const held = open.reduce((sum, l) => sum + l.tokenQty, 0n);
    if (held === 0n) continue; // tokens that were never read in; nothing of ours to take
    const left = held > m.amountRaw ? held - m.amountRaw : 0n;
    // Each lot keeps the same share of itself; the rounding goes to the newest, so the total is exact.
    let kept = 0n;
    for (const l of open) {
      l.tokenQty = (l.tokenQty * left) / held;
      kept += l.tokenQty;
    }
    const last = open.findLast((l) => l.tokenQty > 0n) ?? open[open.length - 1];
    if (last !== undefined) last.tokenQty += left - kept;
  }

  return open
    .filter((l) => l.tokenQty > 0n)
    .map((l) => ({
      ...l.lot,
      tokenQty: l.tokenQty,
      shares: scaled(l.tokenQty, decimals).mul(l.lot.multiplier),
    }));
};

/** A rise in a token's multiplier: a dividend paid as more stock per token. */
export interface MultiplierStep {
  readonly at: Date;
  readonly from: Decimal;
  readonly to: Decimal;
}

/** A dividend a held lot earned since it arrived, at no cost. */
export interface PlannedDividend {
  readonly shares: Decimal;
  readonly at: Date;
}

/**
 * The dividends the lots still held earned after they arrived: for each rise
 * in the multiplier after a lot's arrival, its tokens times the rise. Written
 * as their own lots, dated when each was observed, so position-sync finds the
 * lots already at today's multiplier and does not pay years of dividends as
 * one new one.
 */
export const dividendsSince = (
  lots: readonly PlannedLot[],
  steps: readonly MultiplierStep[],
  decimals: number,
): readonly PlannedDividend[] => {
  const byStep = new Map<number, PlannedDividend>();
  for (const step of steps) {
    const rise = step.to.sub(step.from);
    if (!rise.gt(ZERO)) continue;
    for (const lot of lots) {
      if (lot.acquiredAt.getTime() >= step.at.getTime()) continue;
      const gained = scaled(lot.tokenQty, decimals).mul(rise);
      const at = step.at.getTime();
      const seen = byStep.get(at);
      byStep.set(at, { shares: (seen?.shares ?? ZERO).add(gained), at: step.at });
    }
  }
  return [...byStep.values()]
    .filter((d) => d.shares.gte(DIVIDEND_FLOOR))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
};

/**
 * The multiplier in force at a moment, from the steps observed: the last one
 * at or before it, else the first one's starting value, else today's. Before
 * Mercury recorded multipliers the steps cannot be told apart from shares, so
 * such an arrival takes the earliest multiplier known and is credited no
 * dividend for the time before it.
 */
export const multiplierAt = (at: Date, steps: readonly MultiplierStep[], current: Decimal): Decimal => {
  let found: Decimal | null = null;
  for (const s of steps) if (s.at.getTime() <= at.getTime()) found = s.to;
  return found ?? steps[0]?.from ?? current;
};
