import type { Decimal } from "../money.js";

export type Side = "buy" | "sell";

export type Issuer = "backed" | "ondo";

/**
 * The state of the instrument, not of our system.
 * `corp_action_pending` is the window between a stock going ex-dividend and the
 * issuer folding that dividend into the token's multiplier. See docs/04.
 */
export type InstrumentStatus =
  | "open"
  | "premarket"
  | "postmarket"
  | "overnight"
  | "closed"
  | "halted"
  | "stale"
  | "corp_action_pending";

export const TRADING_SESSIONS: readonly InstrumentStatus[] = ["open", "premarket", "postmarket", "overnight"];

export interface Quote {
  /** USD for a buy, tokens for a sell. */
  readonly inAmount: Decimal;
  /** Tokens for a buy, USD for a sell. */
  readonly outAmount: Decimal;
  /** As a ratio, not a percentage. 0.0085 is 85 basis points. */
  readonly priceImpact: Decimal;
  readonly routeLabels: readonly string[];
  readonly quoteId: string;
  readonly expiresAt: Date;
}

export interface Candidate {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  /** Shares of the underlying that one token represents. Always >= 1. */
  readonly multiplier: Decimal;
  /** Null when no route exists at this size. */
  readonly quote: Quote | null;
}

export interface ReferencePrice {
  /** Price of one real share, from Chainlink. See ADR 0006. */
  readonly pricePerShare: Decimal;
  readonly observedAt: Date;
  /**
   * Gross dividend less withholding, for a dividend that has gone ex but is not
   * yet in the multiplier. Zero almost always. See docs/04.
   */
  readonly pendingDividendNet: Decimal;
}

export interface ExecutionPolicy {
  readonly maxPriceImpact: Decimal;
  readonly premiumTolerance: Decimal;
  readonly maxReferenceAgeSecOpen: number;
  readonly maxReferenceAgeSecClosed: number;
  readonly minOrderUsd: Decimal;
  readonly blockOnCorpActionPending: boolean;
}

export interface DecisionInput {
  readonly ticker: string;
  readonly side: Side;
  /** USD for a buy. Shares for a sell. */
  readonly amount: Decimal;
  readonly candidates: readonly Candidate[];
  readonly reference: ReferencePrice;
  readonly status: InstrumentStatus;
  readonly policy: ExecutionPolicy;
  readonly now: Date;
  readonly marketOpensAt?: Date;
}

export type CandidateRejection = "no_route" | "impact_too_high" | "zero_output";

export interface PricedCandidate {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly multiplier: Decimal;
  readonly pricePerToken: Decimal | null;
  /** The number that matters. Token price corrected by the multiplier. */
  readonly pricePerShare: Decimal | null;
  readonly priceImpact: Decimal | null;
  readonly routeLabels: readonly string[];
  readonly viable: boolean;
  readonly rejection: CandidateRejection | null;
  readonly quoteId: string | null;
}

export type RefuseReason =
  | "below_minimum"
  | "no_route"
  | "impact_too_high"
  | "reference_stale"
  | "instrument_halted"
  | "corp_action_pending"
  | "no_candidates";

interface DecisionBase {
  readonly ticker: string;
  readonly side: Side;
  readonly amount: Decimal;
  readonly fairPricePerShare: Decimal;
  readonly status: InstrumentStatus;
  readonly candidates: readonly PricedCandidate[];
  readonly decidedAt: Date;
}

export interface ExecuteDecision extends DecisionBase {
  readonly kind: "execute";
  readonly best: PricedCandidate;
  /** Ratio. Positive means we are paying above fair value. */
  readonly premium: Decimal;
  readonly warning: string | null;
}

export interface OfferQueueDecision extends DecisionBase {
  readonly kind: "offer_queue";
  readonly best: PricedCandidate;
  readonly premium: Decimal;
  readonly suggestedTriggerPricePerShare: Decimal;
  readonly marketOpensAt: Date | null;
}

export interface RefuseDecision extends DecisionBase {
  readonly kind: "refuse";
  readonly reason: RefuseReason;
  readonly detail: string;
}

export type Decision = ExecuteDecision | OfferQueueDecision | RefuseDecision;
