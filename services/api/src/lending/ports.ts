import type { Decimal } from "@mercury/core";

/** One xStock Kamino accepts as collateral, and the room left in its reserve. */
export interface CollateralTerms {
  /** "SPY" for SPYx; the symbol itself ("cbBTC") for collateral that is not a stock. */
  readonly ticker: string;
  /**
   * False for other collateral in the market, like cbBTC. It is never offered,
   * but a wallet that already pledged it has that value counted, as Kamino does.
   */
  readonly isStock: boolean;
  readonly symbol: string;
  readonly mint: string;
  readonly reserve: string;
  readonly decimals: number;
  /** Max loan-to-value, 0–1. */
  readonly ltv: Decimal;
  /** Where liquidation starts, 0–1. Always at or above `ltv`. */
  readonly liquidationThreshold: Decimal;
  /** Kamino's oracle price for one token. What Kamino values collateral at. */
  readonly pricePerToken: Decimal;
  /** Null means Kamino sets no cap. */
  readonly depositCapTokens: Decimal | null;
  readonly depositedTokens: Decimal;
}

/** The USDC reserve every loan is drawn from. */
export interface PoolTerms {
  readonly reserve: string;
  readonly availableUsd: Decimal;
  readonly borrowedUsd: Decimal;
  readonly borrowCapUsd: Decimal;
  /** 1 for USDC. Debt counts at this multiple against the limit. */
  readonly borrowFactor: Decimal;
  readonly borrowApy: Decimal;
}

export interface LendingTerms {
  readonly collateral: readonly CollateralTerms[];
  readonly pool: PoolTerms;
}

/** A wallet's Kamino obligation, valued at Kamino's oracle prices. */
export interface LendingPosition {
  readonly obligation: string;
  readonly deposits: readonly {
    readonly ticker: string;
    readonly isStock: boolean;
    readonly mint: string;
    /** In the mint's smallest unit, for the books. `tokens` is the same amount, scaled. */
    readonly raw: bigint;
    readonly decimals: number;
    readonly tokens: Decimal;
    readonly valueUsd: Decimal;
  }[];
  readonly debtUsd: Decimal;
  readonly debtBfAdjustedUsd: Decimal;
  /** Σ deposit × LTV: Kamino's own ceiling on debt. */
  readonly allowedBorrowUsd: Decimal;
  /** Σ deposit × liquidation threshold: debt at which liquidation starts. */
  readonly liquidationBorrowUsd: Decimal;
}

export type LendingIntent =
  | {
      readonly kind: "deposit_and_borrow";
      readonly ticker: string;
      readonly tokensRaw: string;
      readonly usd: Decimal;
    }
  | { readonly kind: "deposit"; readonly ticker: string; readonly tokensRaw: string }
  | { readonly kind: "borrow"; readonly usd: Decimal }
  | { readonly kind: "repay"; readonly usd: Decimal | "all" }
  | { readonly kind: "withdraw"; readonly ticker: string; readonly tokensRaw: string | "all" };

export interface BuiltTransactions {
  /**
   * Unsigned v0 transactions, base64, to be signed and sent in this order. One
   * today, a first action included: its account setup rides in the same one.
   */
  readonly transactions: readonly string[];
  /** Each transaction's message, so a sponsored one can be recognised when it comes back signed. */
  readonly messages: readonly Uint8Array[];
  /** True when this also opens the wallet's Kamino account: its obligation does not exist yet. */
  readonly firstTime: boolean;
  readonly expiresAt: Date;
}

export interface LendingSource {
  terms(): Promise<LendingTerms>;
  position(wallet: string): Promise<LendingPosition | null>;
  /** `sponsor`, when given, pays the fees and any rent the wallet cannot. */
  build(wallet: string, intent: LendingIntent, sponsor?: string): Promise<BuiltTransactions>;
}
