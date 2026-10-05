import type { BasketDefinition, ProviderBasket } from "./primitives.js";

export interface BasketProvider {
  list(): Promise<readonly ProviderBasket[]>;
  validate(basket: BasketDefinition): Promise<void>;
  create(basket: BasketDefinition): Promise<string>;
  get(id: string): Promise<ProviderBasket>;
}

export interface BasketStore {
  load(): Promise<readonly BasketDefinition[]>;
  withSyncLock<T>(work: () => Promise<T>): Promise<T>;
}
