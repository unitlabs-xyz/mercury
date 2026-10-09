import type { Decimal } from "../money.js";

export type Side = "buy" | "sell";

export type Issuer = "backed" | "ondo";

/**
 * The state of the instrument, not of our system.
 * `corp_action_pending` is the window between a stock going ex-dividend and the
 * issuer folding that dividend into the token's multiplier. See docs/04.
 */
export type InstrumentStatus =
  "open" | "premarket" | "postmarket" | "overnight" | "closed" | "halted" | "stale" | "corp_action_pending";

export const TRADING_SESSIONS: readonly InstrumentStatus[] = ["open", "premarket", "postmarket", "overnight"];

export interface Quote {
  /** USD for a buy, tokens for a sell. */
  readonly inAmount: Decimal;
  /** Tokens for a buy, USD for a sell. */
  readonly outAmount: Decimal;
  /**
   * The least the route will hand back before it aborts, at the slippage it was
   * quoted with. `outAmount` is what the route expects; this is what it promises,
   * and it is the only one of the two a user can be held to. Jupiter returns it
   * as `otherAmountThreshold`.
   *
   * Required rather than optional: an adapter that forgets to carry the floor
   * would silently drop the guarantee rather than fail to compile.
   */
  readonly minOutAmount: Decimal;
  /** As a ratio, not a percentage. 0.0085 is 85 basis points. */
  readonly priceImpact: Decimal;
  readonly routeLabels: readonly string[];
  readonly quoteId: string;
  readonly expiresAt: Date;
  /**
   * The provider's own quote payload, verbatim and opaque. Core never reads it;
   * it travels back to the adapter that produced it, which is what lets a quote
   * be redeemed for a transaction rather than re-fetched and re-priced. Dropped
   * at the wire boundary — it never reaches a client or the database.
   */
  readonly raw: unknown;
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
  /**
   * How far the fill may land under the quote before the route aborts. Spent
   * out of the same budget as `premiumTolerance`, so it belongs beside it
   * rather than buried in whichever adapter happens to be quoting.
   */
  readonly slippageBps: number;
  /**
   * How far the price may move against the user between the quote they were
   * shown and the quote that gets built, before we stop and ask again.
   */
  readonly maxQuoteDriftBps: number;
  /**
   * How old the reference may be before it is treated as uncertain.
   *
   * Not a cliff any more. Inside this, the premium tolerance is exactly
   * `premiumTolerance`; past it the tolerance widens with age, up to
   * `referenceStaleMaxWidenBps`, and the order still goes through the ordinary
   * premium logic rather than being refused outright.
   */
  readonly maxReferenceAgeSecOpen: number;
  readonly maxReferenceAgeSecClosed: number;
  /**
   * The age past which the reference carries no information and the order is
   * refused.
   *
   * Session-dependent because the two regimes are different in kind. While the
   * market trades, an hour-old price is genuinely behind — the thing it is
   * meant to describe has moved and we cannot say by how much. While the market
   * is shut, the reference *is* the last close: it is as old as the weekend and
   * every brokerage in the world is valuing the same position off the same
   * number. Refusing then would not be caution, it would be refusing to trade
   * on the only price that exists.
   *
   * Four days clears a long weekend. Past that, something is broken upstream
   * rather than merely closed.
   */
  readonly deadReferenceAgeSecOpen: number;
  readonly deadReferenceAgeSecClosed: number;
  /**
   * How far the premium tolerance may widen for an old reference, at the point
   * the reference is about to be abandoned entirely.
   *
   * It widens because an old reference is uncertain, not because a bigger
   * premium became acceptable — the gap being measured is partly real
   * dislocation and partly the market having moved since the reading. Capped,
   * because past some width the check stops being a check.
   */
  readonly referenceStaleMaxWidenBps: number;
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
  /**
   * The bound on `pricePerShare`: the most a buy can pay, the least a sell can
   * receive. Derived from the route's guaranteed floor, not from the expected
   * amount, so it is the number a promise can be made against.
   */
  readonly worstPricePerShare: Decimal | null;
  /**
   * What this candidate actually trades, in shares.
   *
   * For a buy, the shares the quote delivers. For a sell, the shares it
   * consumes — which is not always the number asked for, because a sell is
   * capped at what the wallet holds of that wrapper. The ticket needs the
   * difference to explain itself rather than quietly under-filling.
   */
  readonly filledShares: Decimal | null;
  readonly priceImpact: Decimal | null;
  readonly routeLabels: readonly string[];
  readonly viable: boolean;
  readonly rejection: CandidateRejection | null;
  readonly quoteId: string | null;
  /** The provider payload from `Quote.raw`, carried through so the winner can be built. */
  readonly quoteRaw: unknown;
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
  /** The slippage every candidate here was quoted with. See `worstPricePerShare`. */
  readonly maxSlippageBps: number;
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
