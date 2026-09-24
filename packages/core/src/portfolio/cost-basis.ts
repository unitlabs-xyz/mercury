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
