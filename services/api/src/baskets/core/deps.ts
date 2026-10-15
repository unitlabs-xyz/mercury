import type {
  BasketInsights,
  BasketOperation,
  BasketPortfolioSnapshot,
  TriggeredBasketRebalance,
  BasketExitMessage,
  BasketExitMode,
  BasketExitSubmission,
  PreparedBasketExit,
  SubmittedBasketExit,
} from "@mercury/types";
import type {
  BasketAsset,
  BasketDefinition,
  CustomBasket,
  CuratedBasket,
  ProviderBasket,
  StrategyPerformance,
  ProviderPortfolio,
  EnrollmentChallenge,
  EnrollmentIntent,
  ExitIntent,
  ExitIntentPayload,
} from "./primitives.js";

export interface BasketProvider {
  list(): Promise<readonly ProviderBasket[]>;
  validate(basket: BasketDefinition): Promise<void>;
  create(basket: BasketDefinition): Promise<string>;
  get(id: string): Promise<ProviderBasket>;
  /** The new active allocation; portfolios rebalance to it on their next run. No
   *  counterpart for the name, because Glider holds the slug and that never changes. */
  publishAllocation(id: string, assets: BasketDefinition["assets"]): Promise<void>;
  strategyPerformance(id: string): Promise<StrategyPerformance>;
  /** Glider's all-time money-weighted return, absent until enough history exists. */
  portfolioReturn(id: string): Promise<string | null>;
  allocationBreakdown(assets: BasketDefinition["assets"]): Promise<NonNullable<BasketInsights["allocation"]>>;
  effectiveSwapFeeBps(id: string): Promise<number | null>;
  portfolios(ownerAccountId: string, strategyId: string): Promise<readonly ProviderPortfolio[]>;
  portfoliosForOwner(ownerAccountId: string): Promise<readonly ProviderPortfolio[]>;
  portfolio(
    id: string,
  ): Promise<
    Pick<
      BasketPortfolioSnapshot,
      "portfolioId" | "ownerAccountId" | "strategyId" | "smartAccounts" | "schedule"
    >
  >;
  positions(
    id: string,
  ): Promise<
    Pick<
      BasketPortfolioSnapshot,
      "portfolioId" | "totalValueUsd" | "inTransitUsd" | "fetchedAt" | "assets" | "warnings"
    >
  >;
  operation(portfolioId: string, operationId: string): Promise<BasketOperation>;
  triggerRebalance(portfolioId: string): Promise<TriggeredBasketRebalance>;
  prepareExit(
    portfolioId: string,
    mode: BasketExitMode,
    recipientAccountId: string,
    assets: readonly { assetId: string; amountRaw: string }[],
    submission: BasketExitSubmission,
  ): Promise<Pick<PreparedBasketExit, "expiresAt" | "authorization" | "message">>;
  submitExit(
    portfolioId: string,
    mode: BasketExitMode,
    message: BasketExitMessage,
    signature: string,
    submission: BasketExitSubmission,
  ): Promise<Omit<SubmittedBasketExit, "mode">>;
  prepareEnrollment(ownerAccountId: string, strategyId: string): Promise<EnrollmentChallenge>;
  enroll(
    ownerAccountId: string,
    strategyId: string,
    challenge: EnrollmentChallenge,
    signed: string,
    name: string,
  ): Promise<ProviderPortfolio>;
}

export interface BasketFunding {
  prepare(
    ownerAccountId: string,
    destinationAccountId: string,
    amountRaw: bigint,
  ): Promise<{
    transaction: string;
    expiresAt: Date;
  }>;
}

export class BasketFundingPreflightError extends Error {}
export class BasketExitUnsupportedError extends Error {}
export class BasketRebalanceCooldownError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super("Glider rebalance cooldown is active.");
  }
}

/**
 * Apart from `BasketProvider` because it is a different contract: that one is
 * Glider's documented v2 API, this is the undocumented route its front end
 * browses with. The risky one stays swappable without touching money.
 */
export interface BasketAssetSource {
  list(): Promise<readonly BasketAsset[]>;
}

/**
 * Apart from `BasketStore`, which holds a user's in-flight business. This is a
 * catalogue: the same rows for everybody, replaced whole once a day.
 */
export interface BasketAssetStore {
  /** The catalogue, in ticker order. */
  all(): Promise<readonly BasketAsset[]>;
  /** How many are on offer, for deciding whether a fresh list can be believed. */
  count(): Promise<number>;
  /** All of it or none: a picker half-written is worse than one a day old. */
  replace(assets: readonly BasketAsset[]): Promise<number>;
}

/** Baskets people wrote for themselves. Every read is owner-scoped: that is the privacy. */
export interface CustomBasketStore {
  /** Everything this owner has, newest first, drafts included. */
  mine(userId: string): Promise<readonly CustomBasket[]>;
  /** Null when the slug is unknown, deleted, or somebody else's. */
  bySlug(userId: string, slug: string): Promise<CustomBasket | null>;
  /** Throws on a slug already taken; the unique index decides. */
  draft(input: {
    userId: string;
    slug: string;
    name: string;
    description: string;
    assets: CustomBasket["assets"];
  }): Promise<CustomBasket>;
  attachStrategy(id: string, providerId: string): Promise<void>;
  reviseAssets(id: string, assets: CustomBasket["assets"]): Promise<void>;
  rename(id: string, name: string, description: string): Promise<void>;
  /** Soft: Glider cannot delete a strategy, so the slug stays spent. */
  remove(id: string): Promise<void>;
}

export interface BasketStore {
  load(): Promise<readonly CuratedBasket[]>;
  withSyncLock<T>(work: () => Promise<T>): Promise<T>;
  saveEnrollmentIntent(intent: Omit<EnrollmentIntent, "id" | "portfolioId">): Promise<string>;
  enrollmentIntent(id: string): Promise<EnrollmentIntent | null>;
  completeEnrollmentIntent(id: string, portfolioId: string): Promise<void>;
  saveRebalance(action: {
    userId: string;
    slug: string;
    ownerAccountId: string;
    strategyId: string;
    portfolioId: string;
    operationId: string;
    submittedAt: string;
  }): Promise<void>;
  exitIntent(userId: string, nonce: string): Promise<ExitIntent | null>;
  saveExitIntent(action: {
    userId: string;
    slug: string;
    ownerAccountId: string;
    strategyId: string;
    portfolioId: string;
    nonce: string;
    expiresAt: Date;
    payload: ExitIntentPayload;
  }): Promise<ExitIntent>;
  attachExitOperation(id: string, operationId: string, submittedAt: Date): Promise<void>;
  /**
   * Which Glider smart account this owner's basket money moves through.
   *
   * Recorded as soon as it is resolved, which is before any money can reach
   * it, so the wallet-events job can tell basket funding from a withdrawal
   * when it first sees the transfer rather than only once it is confirmed.
   */
  rememberBasketAccount(input: {
    ownerAccountId: string;
    portfolioId: string;
    address: string;
  }): Promise<void>;
  recentActions(
    userId: string,
    portfolioId: string,
  ): Promise<
    readonly {
      id: string;
      kind: string;
      createdAt: Date;
      operationId: string | null;
    }[]
  >;
  confirmFunding(input: {
    userId: string;
    slug: string;
    portfolioId: string;
    title: string;
    signature: string;
    mint: string;
    amountRaw: bigint;
    occurredAt: Date;
  }): Promise<void>;
  recentFunding(
    userId: string,
    portfolioId: string,
  ): Promise<
    readonly {
      id: string;
      occurredAt: Date;
      title: string;
      amountUsd: string | null;
      txSignature: string | null;
    }[]
  >;
  recentSettlements(
    userId: string,
    portfolioId: string,
  ): Promise<
    readonly {
      id: string;
      kind: string;
      occurredAt: Date;
      title: string;
      subtitle: string | null;
      amountUsd: string | null;
      tokenQuantity: string | null;
      txSignature: string | null;
    }[]
  >;
  completedEnrollments(
    userId: string,
    ownerAccountId: string,
  ): Promise<
    readonly {
      portfolioId: string;
      strategyId: string;
      createdAt: Date;
    }[]
  >;
}
