import type { Candidate, Decimal, Issuer, Side } from "@mercury/core";

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
 * Symmetry sits behind these four methods and nothing else. `@mercury/core` never
 * imports the SDK. That boundary is what keeps writing our own vault a week of work
 * rather than a rewrite. See ADR 0005.
 */
export interface BasketVenue {
  quote(basketId: string, usdAmount: Decimal): Promise<BasketQuote>;
  invest(
    basketId: string,
    deposits: readonly { mint: string; amount: Decimal }[],
    owner: string,
  ): Promise<readonly string[]>;
  redeem(basketId: string, tokens: Decimal, owner: string): Promise<readonly string[]>;
  value(basketId: string): Promise<{ nav: Decimal; navPerToken: Decimal; weights: readonly BasketWeight[] }>;
}

/** What the stock sync needs and `TokenRegistry` deliberately does not carry. */
export interface ListedWrapper {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  /** The issuer's own name, e.g. "NVIDIA xStock". Our display name is editorial. */
  readonly name: string;
  readonly icon: string | null;
  readonly liquidityUsd: Decimal;
  readonly holders: number;
  /** Buyers minus sellers over 24h, from Jupiter's own stats. Never negative here. */
  readonly netBuyers24h: number;
  readonly volume24hUsd: Decimal;
  readonly traders24h: number;
  /** Jupiter prices it at all. False means no pool: nothing to quote, nothing to show. */
  readonly hasMarket: boolean;
}

export interface ListedInstrument {
  readonly ticker: string;
  readonly wrappers: readonly ListedWrapper[];
}

/**
 * The live token universe, richer than `TokenRegistry` and used only to fill the
 * `instrument` and `token` tables. Kept separate so the decision path keeps
 * depending on the four fields it actually needs.
 */
export interface SupportedStocks {
  instruments(): Promise<readonly ListedInstrument[]>;
}

/** One token account's worth, in the mint's smallest unit. Never a float. */
export interface TokenBalance {
  readonly mint: string;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

export interface MintConfig {
  readonly decimals: number;
  /**
   * The multiplier in force right now, which is `newMultiplier` once its
   * effective timestamp has passed. One token is this many shares.
   */
  readonly multiplier: Decimal;
  /** Token-2022 Pausable. True when the issuer has halted the token. */
  readonly isPaused: boolean;
}

/**
 * What we read from Solana without ever holding a key. Two calls, both public:
 * a wallet's token accounts, and a mint's Token-2022 extensions.
 */
export interface ChainReader {
  tokenBalances(owner: string): Promise<readonly TokenBalance[]>;
  /** Null when the account does not exist or is not a Token-2022 mint. */
  mintConfig(mint: string): Promise<MintConfig | null>;
}
