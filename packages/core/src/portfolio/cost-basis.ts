import { D, ZERO, type Decimal } from "../money.js";

export type LotSource = "buy" | "transfer_in" | "dividend" | "basket";

export interface Lot {
  readonly shares: Decimal;
  readonly unitCostUsd: Decimal;
  readonly acquiredAt: Date;
  readonly source: LotSource;
  readonly isEstimated: boolean;
}

export interface Position {
  readonly shares: Decimal;
  readonly costBasisUsd: Decimal;
}

export const EMPTY_POSITION: Position = { shares: ZERO, costBasisUsd: ZERO };

export const avgUnitCost = (p: Position): Decimal =>
  p.shares.isZero() ? ZERO : p.costBasisUsd.div(p.shares);

/** Tokens are not shares. One token is `multiplier` shares. */
export const tokensToShares = (tokens: Decimal, multiplier: Decimal): Decimal => tokens.mul(multiplier);

export const applyBuy = (p: Position, sharesAcquired: Decimal, usdSpent: Decimal): Position => ({
  shares: p.shares.add(sharesAcquired),
  costBasisUsd: p.costBasisUsd.add(usdSpent),
});

export interface SellResult {
  readonly position: Position;
  readonly realisedPnlUsd: Decimal;
  readonly costRemoved: Decimal;
}

/** Average cost. Selling does not change the average unit cost of what is left. */
export const applySell = (p: Position, sharesSold: Decimal, proceedsUsd: Decimal): SellResult => {
  if (sharesSold.gt(p.shares)) throw new RangeError("cannot sell more shares than held");
  const unit = avgUnitCost(p);
  const costRemoved = sharesSold.mul(unit);
  return {
    position: { shares: p.shares.sub(sharesSold), costBasisUsd: p.costBasisUsd.sub(costRemoved) },
    realisedPnlUsd: proceedsUsd.sub(costRemoved),
    costRemoved,
  };
};

/**
 * A dividend arrives as a rise in the token's multiplier, so the holder gains shares
 * without spending anything. Cost basis is unchanged, which means the average cost per
 * share falls. That is correct: the same money now buys more shares.
 *
 * Recomputing shares from the current multiplier without recording this lot would show
 * a phantom gain and an overstated cost basis at the same time. See docs/05.
 */
export const applyDividend = (p: Position, sharesGained: Decimal): Position => ({
  shares: p.shares.add(sharesGained),
  costBasisUsd: p.costBasisUsd,
});

export const sharesGainedFromMultiplier = (
  tokenQty: Decimal,
  oldMultiplier: Decimal,
  newMultiplier: Decimal,
): Decimal => {
  if (newMultiplier.lte(oldMultiplier)) return ZERO;
  return tokenQty.mul(newMultiplier.sub(oldMultiplier));
};

export const positionFromLots = (lots: readonly Lot[]): Position =>
  lots.reduce<Position>(
    (acc, lot) => ({
      shares: acc.shares.add(lot.shares),
      costBasisUsd: acc.costBasisUsd.add(lot.shares.mul(lot.unitCostUsd)),
    }),
    EMPTY_POSITION,
  );

export const unrealisedPnl = (p: Position, pricePerShare: Decimal): Decimal =>
  p.shares.mul(pricePerShare).sub(p.costBasisUsd);

export const dividendLot = (sharesGained: Decimal, at: Date): Lot => ({
  shares: sharesGained,
  unitCostUsd: D(0),
  acquiredAt: at,
  source: "dividend",
  isEstimated: false,
});

/**
 * A position, reduced to what splitting its return needs.
 *
 * Every figure is over the shares a lot covers, never over the whole holding:
 * shares that arrived from somewhere we did not witness have no cost and no
 * reference, and measuring them against either would report their entire value
 * as profit.
 */
export interface StackedPosition {
  readonly sharesWithBasis: Decimal;
  /** What the swaps charged, fees excluded. */
  readonly costBasisUsd: Decimal;
  /** What the same shares were quoted at when they were acquired. */
  readonly referenceBasisUsd: Decimal;
  /** Fees paid to acquire the shares still held. */
  readonly feeUsd: Decimal;
}

export interface StackedReturn {
  /** What the stock did: today's quote against the quote when it was bought. */
  readonly marketPnlUsd: Decimal;
  /** What it cost to get in: the premium and spread paid, plus fees. Positive is a cost. */
  readonly tradingCostUsd: Decimal;
  /** Market less cost, which is the dollars the position is actually up or down. */
  readonly totalPnlUsd: Decimal;
}

/** The two prices a wrapper has at once. They are rarely the same number. */
export interface SharePrices {
  /** What one share would fetch in the pool today. The holding is valued at this. */
  readonly marketPerShare: Decimal;
  /**
   * What the underlying equity is quoted at today. The stock's move is
   * measured against this, because it is the question being asked. Null when
   * nothing quotes the underlying, and then the pool stands in for it and the
   * move is reported in the token's own terms.
   */
  readonly referencePerShare: Decimal | null;
}

/**
 * One return, split into the stock's move and the cost of taking the position.
 *
 * These were a single number, and it answered neither question. A buyer whose
 * stock had not moved was shown a loss, because the fee and the premium over
 * the underlying quote were inside the price their shares were recorded at;
 * and a buyer whose stock had moved could not tell how much of the figure was
 * the move. Both lines are reported, and they sum to the honest total — so
 * nothing is hidden by the split, only named.
 *
 * The total is in pool dollars, because that is what the position is worth and
 * what was paid for it. The move is in quote dollars, because that is what the
 * stock did. `tradingCostUsd` is therefore everything between the two: the
 * premium paid getting in, the fee, and whatever the pool is currently asking
 * against the quote to get out. That last part moves on its own, and it should
 * — it is a real cost of holding a wrapper rather than the share, and it is
 * the reason the figure is called a cost of trading and not a fee.
 *
 * `marketPnlUsd` also carries the gain from a dividend, which arrives as free
 * shares against a reference of zero. That is a real gain and it is not a
 * trading cost, so this is where it belongs until it earns a line of its own.
 */
export const stackedReturn = (p: StackedPosition, prices: SharePrices): StackedReturn => {
  const valueUsd = p.sharesWithBasis.mul(prices.marketPerShare);
  const reference = prices.referencePerShare ?? prices.marketPerShare;
  const marketPnlUsd = p.sharesWithBasis.mul(reference).sub(p.referenceBasisUsd);
  // Defined as what the two lines must differ by, so they cannot stop summing
  // to the dollars however the two prices move apart.
  const totalPnlUsd = valueUsd.sub(p.costBasisUsd).sub(p.feeUsd);
  return { marketPnlUsd, tradingCostUsd: marketPnlUsd.sub(totalPnlUsd), totalPnlUsd };
};
