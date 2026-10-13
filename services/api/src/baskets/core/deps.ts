import type {
  ManagedBasketInsights,
  ManagedBasketOperation,
  ManagedBasketPortfolioSnapshot,
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
  BasketTemplate,
  ProviderBasket,
  StrategyPerformance,
  BasketPortfolio,
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
  strategyPerformance(id: string): Promise<StrategyPerformance>;
  /** Glider's all-time money-weighted return, absent until enough history exists. */
  portfolioReturn(id: string): Promise<string | null>;
  allocationBreakdown(
    assets: BasketDefinition["assets"],
  ): Promise<NonNullable<ManagedBasketInsights["allocation"]>>;
  effectiveSwapFeeBps(id: string): Promise<number | null>;
  portfolios(ownerAccountId: string, strategyId: string): Promise<readonly BasketPortfolio[]>;
  portfoliosForOwner(ownerAccountId: string): Promise<readonly BasketPortfolio[]>;
  portfolio(
    id: string,
  ): Promise<
    Pick<
      ManagedBasketPortfolioSnapshot,
      "portfolioId" | "ownerAccountId" | "strategyId" | "smartAccounts" | "schedule"
    >
  >;
  positions(
    id: string,
  ): Promise<
    Pick<
      ManagedBasketPortfolioSnapshot,
      "portfolioId" | "totalValueUsd" | "inTransitUsd" | "fetchedAt" | "assets" | "warnings"
    >
  >;
  operation(portfolioId: string, operationId: string): Promise<ManagedBasketOperation>;
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
  ): Promise<BasketPortfolio>;
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
 * Where the list of holdable assets comes from.
 *
 * Its own port rather than another method on `BasketProvider`. That port is
 * Glider's documented v2 REST API, authenticated with our key; this is the
 * unversioned tRPC route its own front end browses with, public and
 * undocumented. Two different contracts with two different stability
 * guarantees, and keeping them apart means the risky one can be swapped,
 * stubbed or dropped without touching the path that moves money.
 */
export interface BasketAssetSource {
  list(): Promise<readonly BasketAsset[]>;
}

/**
 * Where that list is kept between refreshes.
 *
 * Apart from `BasketStore`, which holds enrollment intents, exit nonces and
 * funding records — a user's in-flight business. This is a catalogue: the same
 * rows for everybody, replaced wholesale once a day. Nothing that reads one
 * needs the other, and a store faked for an enrollment test should not have to
 * pretend to hold an asset list.
 */
export interface BasketAssetStore {
  /** The catalogue, in ticker order. */
  all(): Promise<readonly BasketAsset[]>;
  /** How many are on offer, for deciding whether a fresh list can be believed. */
  count(): Promise<number>;
  /**
   * Swap the catalogue for this one, dropping whatever is not in it.
   *
   * All of it or none: a picker half-written is worse than one a day old.
   * Whether the new list is worth believing is not decided here — that is a
   * rule, and it lives in the service.
   */
  replace(assets: readonly BasketAsset[]): Promise<number>;
}

export interface BasketStore {
  load(): Promise<readonly BasketTemplate[]>;
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
