import type {
  ManagedBasketInsights,
  ManagedBasketOperation,
  ManagedBasketPortfolioSnapshot,
} from "@mercury/types";
import type {
  BasketDefinition,
  BasketTemplate,
  ProviderBasket,
  StrategyPerformance,
  BasketPortfolio,
  EnrollmentChallenge,
  EnrollmentIntent,
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

export interface BasketStore {
  load(): Promise<readonly BasketTemplate[]>;
  withSyncLock<T>(work: () => Promise<T>): Promise<T>;
  saveEnrollmentIntent(intent: Omit<EnrollmentIntent, "id" | "portfolioId">): Promise<string>;
  enrollmentIntent(id: string): Promise<EnrollmentIntent | null>;
  completeEnrollmentIntent(id: string, portfolioId: string): Promise<void>;
}
