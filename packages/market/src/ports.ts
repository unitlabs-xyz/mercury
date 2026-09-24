import type { Decimal, InstrumentStatus, ReferencePrice } from "@mercury/core";

export interface SessionState {
  readonly status: InstrumentStatus;
  readonly isOpen: boolean;
  readonly nextOpenAt: Date | null;
  readonly nextCloseAt: Date | null;
  readonly isWeekend: boolean;
}

/** Pyth publishes a market_session_schedule with holidays and early closes. See ADR 0006. */
export interface SessionSource {
  current(): Promise<SessionState>;
}

/**
 * The price of one real share, independent of any pool. Today this is Jupiter's
 * `stockData.price`, which is the underlying quote the issuer publishes rather
 * than a DEX mid. ADR 0006 measured Chainlink at 0.8bp from fair through a
 * dividend window against 17-20bp for the alternatives and it remains the more
 * correct source; ADR 0010 records why nothing calls it yet, and ADR 0011 records
 * that this became the preferred path rather than only a fallback.
 */
export interface ReferenceSource {
  priceFor(ticker: string): Promise<ReferencePrice | null>;
}

/**
 * How many shares one token is. Two implementations, deliberately:
 * `MintMultipliers` reads the Token-2022 ScaledUiAmount extension on the mint and
 * is what the server uses — exact, and it can answer `isPaused` from the same
 * account. `JupiterMarket` reads the same numbers out of `scaledUiConfig`, which
 * is all a browser can reach without an RPC URL.
 *
 * Both must apply the switchover rule: the multiplier in force is
 * `newMultiplier` once its effective timestamp has passed. See Task 4 of the
 * read-models plan for the measurement.
 */
export interface MultiplierSource {
  multiplierFor(mint: string): Promise<Decimal | null>;
  /** Token-2022 Pausable. True when the issuer has halted the token. */
  isPaused(mint: string): Promise<boolean>;
}

/** Everything one Jupiter price call knows about one token. */
export interface TokenPrice {
  readonly mint: string;
  /** What one token costs, which is one share's price times the multiplier. */
  readonly usdPricePerToken: Decimal;
  /** What one real share costs. Null for a token with no underlying quote. */
  readonly pricePerShare: Decimal | null;
  readonly changePct24h: Decimal | null;
  readonly liquidityUsd: Decimal;
  readonly multiplier: Decimal;
  readonly observedAt: Date | null;
}

/**
 * Prices for a set of mints in one call. Valuing a portfolio needs the token
 * price; `ReferenceSource` needs the share price. They come from the same
 * response, so they are fetched together rather than twice.
 */
export interface PriceBoard {
  pricesFor(mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>>;
}
