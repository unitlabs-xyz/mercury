import type { ManagedBasketInsights, ManagedBasketTemplate } from "@mercury/types";
import type { BasketProvider, BasketStore } from "./deps.js";
import type { BasketDefinition, ProviderBasket, StrategyPerformance, SyncResult } from "./primitives.js";

const allocations = (assets: readonly { assetId: string; weightBps: number }[]) =>
  assets.map(({ assetId, weightBps }) => `${assetId}:${weightBps}`).sort();

function matches(expected: BasketDefinition, actual: ProviderBasket): boolean {
  return (
    actual.name === expected.name &&
    JSON.stringify(allocations(actual.assets)) === JSON.stringify(allocations(expected.assets)) &&
    JSON.stringify(actual.schedule) === JSON.stringify(expected.schedule)
  );
}

export class BasketService {
  private readonly performanceCache = new Map<string, { until: number; value: StrategyPerformance | null }>();
  private readonly insightsCache = new Map<string, { until: number; value: ManagedBasketInsights }>();

  constructor(private readonly deps: { provider?: BasketProvider; store: BasketStore }) {}

  async listTemplates(): Promise<readonly ManagedBasketTemplate[]> {
    const catalog = await this.deps.store.load();
    return catalog.map((template) => ({
      slug: template.slug,
      kind: "managed_portfolio" as const,
      provider: "glider" as const,
      status: template.status,
      tags: [...template.tags],
      canEnroll: template.status === "enabled" && template.providerId !== undefined,
      name: template.name,
      description: template.description,
      strategyId: template.providerId ?? null,
      sourceStrategyId: template.sourceStrategyId,
      performance: null,
      schedule: template.schedule,
      allocations: template.assets.map(({ ticker, assetId, weightBps }) => {
        const mint = assetId.split("/spl:")[1];
        if (mint === undefined) throw new Error(`Invalid Solana asset ID: ${assetId}`);
        return { ticker, mint, assetId, weightBps };
      }),
    }));
  }

  async getTemplate(slug: string): Promise<ManagedBasketTemplate | null> {
    const template = (await this.listTemplates()).find((item) => item.slug === slug);
    if (template === undefined) return null;
    const performance = await this.strategyPerformance(template.strategyId);
    return {
      ...template,
      performance:
        performance === null
          ? null
          : {
              basis: "modeled_strategy_twr",
              asOf: performance.asOf,
              points: [...performance.points],
              windows: [...performance.windows],
            },
    };
  }

  async getInsights(slug: string): Promise<ManagedBasketInsights | null> {
    const definition = (await this.deps.store.load()).find((item) => item.slug === slug);
    if (definition === undefined) return null;
    const empty: ManagedBasketInsights = { allocation: null, integratorSwapFeeBps: null };
    if (this.deps.provider === undefined || definition.providerId === undefined) return empty;
    const cached = this.insightsCache.get(definition.providerId);
    if (cached && Date.now() < cached.until) return cached.value;
    const provider = this.deps.provider;
    const [allocation, fee] = await Promise.allSettled([
      provider.allocationBreakdown(definition.assets),
      provider.effectiveSwapFeeBps(definition.providerId),
    ]);
    const value: ManagedBasketInsights = {
      allocation: allocation.status === "fulfilled" ? allocation.value : null,
      integratorSwapFeeBps: fee.status === "fulfilled" ? fee.value : null,
    };
    if (allocation.status === "rejected")
      console.warn("Glider allocation breakdown unavailable:", slug, allocation.reason);
    if (fee.status === "rejected") console.warn("Glider strategy fee unavailable:", slug, fee.reason);
    this.insightsCache.set(definition.providerId, {
      until:
        Date.now() + (allocation.status === "fulfilled" && fee.status === "fulfilled" ? 300_000 : 30_000),
      value,
    });
    return value;
  }

  private async strategyPerformance(id: string | null): Promise<StrategyPerformance | null> {
    if (this.deps.provider === undefined || id === null) return null;
    const now = Date.now();
    const cached = this.performanceCache.get(id);
    if (cached !== undefined && now < cached.until) return cached.value;
    try {
      const value = await this.deps.provider.strategyPerformance(id);
      this.performanceCache.set(id, { until: now + 300_000, value });
      return value;
    } catch (error) {
      console.warn("Glider strategy performance unavailable:", id, error);
      this.performanceCache.set(id, { until: now + 30_000, value: null });
      return null;
    }
  }

  async sync(): Promise<SyncResult> {
    if (this.deps.provider === undefined) throw new Error("Glider provider is not configured");
    const provider = this.deps.provider;
    const catalog = await this.deps.store.load();
    if (catalog.every((basket) => basket.providerId !== undefined)) {
      return {
        strategyIds: Object.fromEntries(catalog.map((basket) => [basket.slug, basket.providerId!])),
        recorded: catalog.length,
        reused: 0,
        created: 0,
      };
    }
    return this.deps.store.withSyncLock(async () => {
      const definitions = await this.deps.store.load();
      const existing = [...(await provider.list())];
      const strategyIds: Record<string, string> = {};
      let recorded = 0;
      let reused = 0;
      let created = 0;
      for (const definition of definitions) {
        if (definition.providerId !== undefined) {
          strategyIds[definition.slug] = definition.providerId;
          recorded++;
          continue;
        }
        const namesakes = existing.filter((item) => item.name === definition.name);
        if (namesakes.length > 1 || (namesakes.length === 1 && !matches(definition, namesakes[0]!)))
          throw new Error(`Basket strategy conflict: ${definition.name}`);
        if (namesakes.length === 1) {
          strategyIds[definition.slug] = namesakes[0]!.id;
          reused++;
          continue;
        }
        await provider.validate(definition);
        let id: string;
        try {
          id = await provider.create(definition);
        } catch (error) {
          // The provider may have accepted the POST before the connection failed.
          const afterFailure = (await provider.list()).filter((item) => item.name === definition.name);
          if (afterFailure.length !== 1 || !matches(definition, afterFailure[0]!)) throw error;
          id = afterFailure[0]!.id;
        }
        const readback = await provider.get(id);
        if (readback.id !== id || !matches(definition, readback))
          throw new Error(`Basket strategy readback mismatch: ${definition.name}`);
        strategyIds[definition.slug] = id;
        existing.push(readback);
        created++;
      }
      return { strategyIds, recorded, reused, created };
    });
  }
}
