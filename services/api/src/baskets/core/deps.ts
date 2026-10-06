import type { ManagedBasketInsights } from "@mercury/types";
import type { BasketDefinition, BasketTemplate, ProviderBasket, StrategyPerformance } from "./primitives.js";

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
}

export interface BasketStore {
  load(): Promise<readonly BasketTemplate[]>;
  withSyncLock<T>(work: () => Promise<T>): Promise<T>;
}
