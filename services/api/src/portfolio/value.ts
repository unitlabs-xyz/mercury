import { D, ZERO, type Decimal } from "@mercury/core";
import type { TokenBalance } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import type { ValuedBasket } from "./baskets.js";

/** A holding, reduced to what valuing it needs. */
export interface ValuableHolding {
  readonly shares: Decimal;
  readonly wrappers: readonly { readonly mint: string }[];
}

export interface PortfolioValue {
  readonly stocksUsd: Decimal;
  readonly cashUsd: Decimal;
  /** Glider smart-account value, including its in-transit value exactly once. */
  readonly basketUsd: Decimal;
  /** Owed to Kamino. Borrowed cash is counted in `cashUsd`; this is the other side of it. */
  readonly debtUsd: Decimal;
  /**
   * Cash in the Earn vault, at what its shares would withdraw as now. Apart
   * from `cashUsd`, which is what the wallet can spend this second.
   */
  readonly earnUsd: Decimal;
  /**
   * Net worth: stocks plus cash less debt, the figure at the top of the page.
   *
   * Negative when a fall has taken the collateral below the loan. That is a
   * real state and it is reported, not clamped — a floor at zero would hide
   * the one number the person most needs.
   */
  readonly totalUsd: Decimal;
  /** How much of today's value arrived today. Cash does not move, so this is stocks only. */
  readonly changeUsd: Decimal;
}

/** The wallet's USDC, in dollars. No USDC account is no cash, which is not an error. */
export const cashFrom = (balances: readonly TokenBalance[], usdcMint: string): Decimal => {
  const usdc = balances.find((b) => b.mint === usdcMint);
  return usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));
};

/**
 * What one share of a wrapper would fetch right now, in the pool.
 *
 * Two prices come out of one Jupiter response and they are not the same
 * number: `usdPricePerToken` is what the token trades at, and `pricePerShare`
 * is the issuer's quote for the underlying equity. Measured across twenty
 * xStocks on 9 October 2026 they differed by a median 0.49%, as far apart as
 * 9.4%.
 *
 * Holdings are valued at the first, because that is what the wallet is worth
 * and it is the currency every cost basis here is already in. The second is
 * what a return is measured against, which is a different question — "did the
 * stock move" — and `stackedReturn` answers it with the quote rather than with
 * the pool.
 *
 * This is also `tokenQty x usdPricePerToken` rearranged, which is exactly what
 * `/v1/portfolio/exposure/:ticker` computes: the two endpoints valued the same
 * holding differently until now.
 */
export const marketPricePerShare = (price: TokenPrice): Decimal =>
  price.multiplier.gt(ZERO) ? price.usdPricePerToken.div(price.multiplier) : (price.pricePerShare ?? ZERO);

/**
 * The first of a holding's wrappers the board can price.
 *
 * Every wrapper of this company prices one share the same way, so the first
 * that answers is enough; the share count already spans all of them.
 */
export const priceFor = (
  row: ValuableHolding,
  board: ReadonlyMap<string, TokenPrice>,
): TokenPrice | undefined => row.wrappers.map((w) => board.get(w.mint)).find((p) => p !== undefined);

const basketStockMint = (assetId: string): string | null =>
  assetId.startsWith("solana:") ? (assetId.split("/spl:")[1] ?? null) : null;

/** Only stock tokens need a price-change quote; basket cash and transfers do not move with stocks. */
export const basketStockMints = (baskets: readonly ValuedBasket[]): string[] => [
  ...new Set(
    baskets.flatMap((basket) =>
      basket.holdings.flatMap((asset) =>
        asset.ticker === null ? [] : (basketStockMint(asset.assetId) ?? []),
      ),
    ),
  ),
];

/** Glider supplies the current value; Jupiter supplies only the token's rolling 24-hour move. */
export const valueBasketStocks = (
  baskets: readonly ValuedBasket[],
  board: ReadonlyMap<string, TokenPrice>,
): { stocksUsd: Decimal; changeUsd: Decimal; byPortfolio: ReadonlyMap<string, Decimal | null> } => {
  let stocksUsd = ZERO;
  let changeUsd = ZERO;
  const byPortfolio = new Map<string, Decimal | null>();
  for (const basket of baskets) {
    let basketChange = ZERO;
    let missingQuote = false;
    for (const asset of basket.holdings) {
      if (asset.ticker === null) continue;
      const valueUsd = D(asset.valueUsd);
      stocksUsd = stocksUsd.add(valueUsd);
      const mint = basketStockMint(asset.assetId);
      const changePct24h = mint === null ? null : board.get(mint)?.changePct24h;
      if (changePct24h === null || changePct24h === undefined) {
        if (valueUsd.gt(ZERO)) missingQuote = true;
        continue;
      }
      const denominator = D(100).add(changePct24h);
      if (denominator.lte(ZERO)) {
        missingQuote = true;
        continue;
      }
      const movedUsd = valueUsd.mul(changePct24h).div(denominator);
      basketChange = basketChange.add(movedUsd);
      changeUsd = changeUsd.add(movedUsd);
    }
    const previous = D(basket.valueUsd).sub(basketChange);
    byPortfolio.set(
      basket.portfolioId,
      missingQuote ? null : previous.gt(ZERO) ? basketChange.div(previous).mul(100) : ZERO,
    );
  }
  return { stocksUsd, changeUsd, byPortfolio };
};

/**
 * What an account is worth, from holdings and a price board.
 *
 * Extracted from `GET /v1/portfolio` so the hourly snapshot can call the same
 * code. Two ways to value a portfolio is two different answers to one question,
 * and the one place it would show is a chart that disagrees with the number
 * printed above it.
 */
export const valuePortfolio = (
  rows: readonly ValuableHolding[],
  board: ReadonlyMap<string, TokenPrice>,
  cashUsd: Decimal,
  debtUsd: Decimal,
  basketUsd: Decimal = ZERO,
  earnUsd: Decimal = ZERO,
): PortfolioValue => {
  let stocksUsd = ZERO;
  let changeUsd = ZERO;

  for (const row of rows) {
    if (row.shares.lte(ZERO)) continue; // a closed holding is not a row

    const priced = priceFor(row, board);
    const perShare = priced === undefined ? ZERO : marketPricePerShare(priced);
    const valueUsd = row.shares.mul(perShare);
    // The token's own 24-hour move, now applied to a value in the token's own
    // price. It used to be applied to a value computed from the underlying
    // quote, which put two different price scales inside one subtraction.
    const changePct24h = priced?.changePct24h ?? ZERO;

    // value_now = value_yesterday x (1 + pct/100), so today's move is
    // value_now x pct / (100 + pct). No price history needed for one day.
    const denominator = D(100).add(changePct24h);
    const movedUsd = denominator.isZero() ? ZERO : valueUsd.mul(changePct24h).div(denominator);

    stocksUsd = stocksUsd.add(valueUsd);
    changeUsd = changeUsd.add(movedUsd);
  }

  // Borrowing is total-neutral: the cash arrives and the debt arrives with it.
  // What leverage changes is `stocksUsd` and how far `changeUsd` swings, which
  // is the thing somebody who levers up actually bought.
  return {
    stocksUsd,
    cashUsd,
    basketUsd,
    debtUsd,
    earnUsd,
    totalUsd: stocksUsd.add(cashUsd).add(basketUsd).add(earnUsd).sub(debtUsd),
    changeUsd,
  };
};
