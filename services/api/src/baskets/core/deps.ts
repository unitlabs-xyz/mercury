import type {
  ManagedBasketInsights,
  ManagedBasketOperation,
  ManagedBasketPortfolioSnapshot,
  TriggeredBasketRebalance,
  BasketExitMessage,
  BasketExitMode,
  PreparedBasketExit,
  SubmittedBasketExit,
} from "@mercury/types";
import type {
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
  ): Promise<Pick<PreparedBasketExit, "expiresAt" | "authorization" | "message">>;
  submitExit(
    portfolioId: string,
    mode: BasketExitMode,
    message: BasketExitMessage,
    signature: string,
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
