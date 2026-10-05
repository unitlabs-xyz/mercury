import createClient, { type Client } from "openapi-fetch";
import { z } from "zod";
import type { BasketProvider } from "../core/deps.js";
import type { BasketDefinition, ProviderBasket, StrategyPerformance } from "../core/primitives.js";
import type { components, paths } from "./generated.js";

const BASE = "https://api.glider.fi/v2";
const remoteStrategy = z.object({
  strategyId: z.string().min(1),
  name: z.string(),
  description: z.string().nullish(),
  allocation: z.object({
    assets: z.array(z.object({ assetId: z.string(), weight: z.union([z.string(), z.number()]) })),
  }),
  schedule: z.unknown(),
});
const performance = z.object({
  data: z.object({
    strategyId: z.string(),
    meta: z.object({ method: z.literal("TWR"), asOf: z.string() }),
    points: z.array(z.object({ date: z.string(), percentChange: z.string() })),
    summary: z
      .object({
        windows: z.array(
          z.object({
            window: z.enum(["1d", "1w", "1m", "3m", "6m", "12m", "all"]),
            percentChange: z.string(),
            since: z.string(),
          }),
        ),
      })
      .optional(),
  }),
});
const providerError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

function toBasket(remote: z.infer<typeof remoteStrategy>): ProviderBasket {
  return {
    id: remote.strategyId,
    name: remote.name,
    description: remote.description ?? "",
    assets: remote.allocation.assets.map(({ assetId, weight }) => {
      const percent = Number(weight);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100)
        throw new Error(`Invalid Glider weight for ${assetId}`);
      return { assetId, weightBps: Math.round(Number(percent.toFixed(2)) * 100) };
    }),
    schedule: remote.schedule,
  };
}

function toCreatePayload(basket: BasketDefinition): components["schemas"]["CreateStrategyRequest"] {
  return {
    name: basket.name,
    description: basket.description,
    allocation: {
      assets: basket.assets.map(({ assetId, weightBps }) => ({
        assetId,
        weight: (weightBps / 100).toFixed(2),
      })),
    },
    schedule: basket.schedule,
    isPublic: false,
  };
}

/** OpenAPI types constrain requests; runtime checks still guard provider responses. */
export class GliderClient implements BasketProvider {
  private readonly client: Client<paths>;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.client = createClient<paths>({
      baseUrl: BASE,
      headers: { "x-api-key": apiKey },
      fetch: (request) => fetcher(request, { signal: AbortSignal.timeout(15_000) }),
    });
  }

  private checked<T extends { success: true }>(
    result: { data?: T; error?: unknown; response: Response },
    path: string,
  ): T {
    if (z.object({ success: z.literal(true) }).safeParse(result.data).success) return result.data!;
    const parsed = providerError.safeParse(result.error);
    const detail = parsed.success ? ` ${parsed.data.error.code}: ${parsed.data.error.message}` : "";
    throw new Error(`Glider strategy request failed: ${result.response.status} /v2${path}${detail}`);
  }

  async list(): Promise<readonly ProviderBasket[]> {
    const found: ProviderBasket[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const result = await this.client.GET("/strategies", {
        params: { query: { limit: 200, ...(cursor === null ? {} : { cursor }) } },
      });
      const page = z
        .object({
          data: z.object({ strategies: z.array(remoteStrategy) }),
          nextCursor: z.string().nullable().optional(),
        })
        .parse(this.checked(result, "/strategies"));
      found.push(...page.data.strategies.map(toBasket));
      cursor = page.nextCursor ?? null;
      if (cursor !== null && seen.has(cursor))
        throw new Error("Glider strategy pagination repeated a cursor");
      if (cursor !== null) seen.add(cursor);
    } while (cursor !== null);
    return found;
  }

  async validate(basket: BasketDefinition): Promise<void> {
    const result = await this.client.POST("/strategies/validate", { body: toCreatePayload(basket) });
    z.object({ data: z.object({ valid: z.literal(true) }) }).parse(
      this.checked(result, "/strategies/validate"),
    );
  }

  async create(basket: BasketDefinition): Promise<string> {
    const result = await this.client.POST("/strategies", { body: toCreatePayload(basket) });
    const response = z
      .object({ data: z.object({ strategyId: z.string().min(1) }) })
      .parse(this.checked(result, "/strategies"));
    return response.data.strategyId;
  }

  async get(id: string): Promise<ProviderBasket> {
    const result = await this.client.GET("/strategies/{strategyId}", {
      params: { path: { strategyId: id } },
    });
    const response = z
      .object({ data: remoteStrategy })
      .parse(this.checked(result, `/strategies/${encodeURIComponent(id)}`));
    return toBasket(response.data);
  }

  async strategyPerformance(id: string): Promise<StrategyPerformance> {
    const result = await this.client.GET("/strategies/{strategyId}/performance", {
      params: { path: { strategyId: id } },
    });
    const parsed = performance.parse(
      this.checked(result, `/strategies/${encodeURIComponent(id)}/performance`),
    );
    if (parsed.data.strategyId !== id) throw new Error(`Glider performance ID mismatch: ${id}`);
    return {
      asOf: parsed.data.meta.asOf,
      points: parsed.data.points,
      windows: parsed.data.summary?.windows ?? [],
    };
  }
}
