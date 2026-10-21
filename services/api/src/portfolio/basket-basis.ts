import { D, ZERO, type Decimal } from "@mercury/core";

/**
 * What a basket cost, from the money that went into it.
 *
 * A wallet holding has lots: a price per share, a reference, a fee. A basket
 * has none of that — the fills happen inside Glider and we never see them — so
 * the only basis available is the cash that crossed into the smart account and
 * back out. That is a total, and unlike a wallet holding's return it cannot be
 * split into what the stocks did and what the trading cost, because Glider's
 * own fees and rebalance spreads are inside it with nothing to separate them.
 *
 * It is still worth having. Without it a basket contributes value to net worth
 * and no cost at all, so an account with $500 in baskets and $20 in one stock
 * reported a P&L about the $20.
 *
 * Pure. No database, no clock, no network.
 */

/** One USDC movement between a wallet and one of its own basket accounts. */
export interface BasketMovement {
  readonly portfolioId: string;
  /** Positive dollars, whichever way they went. */
  readonly amountUsd: Decimal;
  /** True when the money went into the basket, false when it came back. */
  readonly inward: boolean;
}

/** An exit that paid out in tokens rather than dollars, which carries no amount. */
export interface InKindExit {
  readonly portfolioId: string;
}

export interface BasketBasis {
  /** Cash in less cash out. Can go negative once more has been taken out than was put in. */
  readonly investedUsd: Decimal;
  /**
   * False when something left this basket in kind.
   *
   * An in-kind withdrawal pays out tokens, so no dollar figure was ever
   * recorded for it and the cash taken out is understated by whatever those
   * tokens were worth. The basis is reported as incomplete rather than quietly
   * overstating what the basket cost, which is the same rule
   * `sharesWithBasis` follows for shares that arrived from outside.
   */
  readonly isComplete: boolean;
}

/**
 * Net invested per basket.
 *
 * Signed by direction rather than by activity kind. The kind is not reliable:
 * the wallet-events job writes funding as a plain `transfer_out` until the
 * funding confirmation re-kinds it, so a basis keyed off `basket_funding`
 * would miss every funding nobody confirmed — which is exactly the population
 * whose numbers are already wrong.
 */
export function basketBases(
  movements: readonly BasketMovement[],
  inKindExits: readonly InKindExit[] = [],
): ReadonlyMap<string, BasketBasis> {
  const invested = new Map<string, Decimal>();
  for (const m of movements) {
    const running = invested.get(m.portfolioId) ?? ZERO;
    invested.set(m.portfolioId, m.inward ? running.add(m.amountUsd) : running.sub(m.amountUsd));
  }
  const incomplete = new Set(inKindExits.map((e) => e.portfolioId));
  const bases = new Map<string, BasketBasis>();
  for (const [portfolioId, investedUsd] of invested) {
    bases.set(portfolioId, { investedUsd, isComplete: !incomplete.has(portfolioId) });
  }
  // A basket that only ever paid out in kind has no cash movement at all, and
  // still must not be reported as a complete basis of nothing.
  for (const portfolioId of incomplete) {
    if (!bases.has(portfolioId)) bases.set(portfolioId, { investedUsd: ZERO, isComplete: false });
  }
  return bases;
}

/**
 * What a basket is up or down: what it is worth now against what went in.
 *
 * Net of everything Glider charged, and there is no honest way to say how much
 * of it was fees — so the figure is labelled as a total wherever it is shown
 * rather than presented beside a wallet holding's share-price move as if the
 * two measured the same thing.
 */
export const basketPnl = (valueUsd: Decimal, basis: BasketBasis): Decimal => valueUsd.sub(basis.investedUsd);

/** A percentage of what went in. Null when nothing did, which is not a return of zero. */
export const basketReturnPct = (valueUsd: Decimal, basis: BasketBasis): Decimal | null =>
  basis.investedUsd.lte(ZERO) ? null : basketPnl(valueUsd, basis).div(basis.investedUsd).mul(D(100));
