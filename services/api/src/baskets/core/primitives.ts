import type { ManagedBasketTag } from "@mercury/types";

export interface BasketDefinition {
  slug: string;
  providerId?: string;
  name: string;
  description: string;
  assets: readonly { assetId: string; weightBps: number }[];
  schedule: { type: "interval"; frequency: "daily" };
}

/** Catalog metadata stays with the definition so sync and discovery read one source. */
export interface BasketTemplate extends BasketDefinition {
  sourceStrategyId: string;
  status: "candidate" | "disabled" | "enabled";
  tags: readonly ManagedBasketTag[];
  assets: readonly (BasketDefinition["assets"][number] & { ticker: string })[];
}

export interface StrategyPerformance {
  asOf: string;
  points: readonly { date: string; percentChange: string }[];
  windows: readonly {
    window: "1d" | "1w" | "1m" | "3m" | "6m" | "12m" | "all";
    percentChange: string;
    since: string;
  }[];
}

export type ProviderBasket = Omit<BasketDefinition, "slug" | "providerId" | "schedule"> & {
  id: string;
  schedule: unknown;
};

export interface SyncResult {
  strategyIds: Record<string, string>;
  recorded: number;
  reused: number;
  created: number;
}
