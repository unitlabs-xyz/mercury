import type { Candidate, Decimal, Issuer, Side } from "@harbor/core";

/**
 * The boundaries between our domain logic and the outside world.
 *
 * Every one of these has a fixture implementation, so the API runs end to end with no
 * keys and no network. That is what lets the web app be built on day one.
 */

export interface TokenRef {
  readonly mint: string;
  readonly symbol: string;
  readonly ticker: string;
  readonly issuer: Issuer;
  readonly decimals: number;
}

export interface TokenRegistry {
  /** Every wrapper we know of for a ticker, across issuers. */
  wrappersFor(ticker: string): Promise<readonly TokenRef[]>;
  all(): Promise<readonly TokenRef[]>;
  byMint(mint: string): Promise<TokenRef | null>;
}

export interface QuoteRequest {
  readonly side: Side;
  readonly mint: string;
  readonly decimals: number;
  /** USD for a buy, tokens for a sell. */
  readonly amount: Decimal;
  readonly slippageBps?: number;
}

/** Jupiter Ultra. See ADR 0008: we never compose, so Jupiter handles landing. */
export interface QuoteSource {
  quote(req: QuoteRequest): Promise<Candidate["quote"]>;
  /** Base64 unsigned transactions for the caller to sign. */
  buildSwap(quoteId: string, owner: string): Promise<readonly string[]>;
}

export interface TriggerOrder {
  readonly account: string;
  readonly status: "open" | "filled" | "partial" | "expired" | "cancelled";
  readonly filledTokens: Decimal;
}

export interface TriggerSource {
  create(req: QuoteRequest & { triggerPricePerToken: Decimal; owner: string }): Promise<readonly string[]>;
  status(account: string): Promise<TriggerOrder>;
  cancel(account: string, owner: string): Promise<readonly string[]>;
}

export interface BasketQuote {
  readonly navPerToken: Decimal;
  readonly estimatedTokensOut: Decimal;
  readonly capRemainingUsd: Decimal | null;
}

export interface BasketWeight {
  readonly ticker: string;
  readonly mint: string;
  readonly weightBps: number;
  readonly currentWeightBps: number;
}

/**
 * Symmetry sits behind these four methods and nothing else. `@harbor/core` never
 * imports the SDK. That boundary is what keeps writing our own vault a week of work
 * rather than a rewrite. See ADR 0005.
 */
export interface BasketVenue {
  quote(basketId: string, usdAmount: Decimal): Promise<BasketQuote>;
  invest(basketId: string, deposits: readonly { mint: string; amount: Decimal }[], owner: string): Promise<readonly string[]>;
  redeem(basketId: string, tokens: Decimal, owner: string): Promise<readonly string[]>;
  value(basketId: string): Promise<{ nav: Decimal; navPerToken: Decimal; weights: readonly BasketWeight[] }>;
}
