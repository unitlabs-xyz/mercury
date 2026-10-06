import type { ManagedBasketInsights } from "@mercury/types";
import type { BasketDefinition, BasketTemplate, ProviderBasket, StrategyPerformance, BasketPortfolio, EnrollmentChallenge, EnrollmentIntent } from "./primitives.js";

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
  prepareEnrollment(ownerAccountId: string, strategyId: string): Promise<EnrollmentChallenge>;
  enroll(ownerAccountId: string, strategyId: string, challenge: EnrollmentChallenge, signed: string, name: string): Promise<BasketPortfolio>;
}

export interface BasketStore {
  load(): Promise<readonly BasketTemplate[]>;
  withSyncLock<T>(work: () => Promise<T>): Promise<T>;
  saveEnrollmentIntent(intent: Omit<EnrollmentIntent, "id" | "portfolioId">): Promise<string>;
  enrollmentIntent(id: string): Promise<EnrollmentIntent | null>;
  completeEnrollmentIntent(id: string, portfolioId: string): Promise<void>;
}
