import { z } from "zod";
import type { BasketProvider } from "../core/deps.js";
import type { BasketDefinition, ProviderBasket } from "../core/primitives.js";

const BASE = "https://api.glider.fi/v2/strategies";
const remoteStrategy = z.object({
  strategyId: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  allocation: z.object({
    assets: z.array(z.object({ assetId: z.string(), weight: z.union([z.string(), z.number()]) })),
  }),
  schedule: z.unknown(),
});

function toBasket(remote: z.infer<typeof remoteStrategy>): ProviderBasket {
  return {
    id: remote.strategyId,
    name: remote.name,
    description: remote.description ?? "",
    assets: remote.allocation.assets.map(({ assetId, weight }) => {
      const percent = Number(weight);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100)
        throw new Error(`Invalid Glider weight for ${assetId}`);
      const weightBps = Math.round(Number(percent.toFixed(2)) * 100);
      return { assetId, weightBps };
    }),
    schedule: remote.schedule,
  };
}

function toCreatePayload(basket: BasketDefinition) {
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
  };
}

export class GliderClient implements BasketProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetcher(url, {
      ...init,
      headers: { "x-api-key": this.apiKey, ...(init?.body ? { "content-type": "application/json" } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json();
    const envelope = z.object({ success: z.literal(true) }).safeParse(body);
    if (!response.ok || !envelope.success) {
      const providerError = z
        .object({ error: z.object({ code: z.string(), message: z.string() }) })
        .safeParse(body);
      const detail = providerError.success
        ? ` ${providerError.data.error.code}: ${providerError.data.error.message}`
        : "";
      throw new Error(`Glider strategy request failed: ${response.status} ${new URL(url).pathname}${detail}`);
    }
    return body;
  }

  async list(): Promise<readonly ProviderBasket[]> {
    const found: ProviderBasket[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const url = new URL(BASE);
      url.searchParams.set("limit", "200");
      if (cursor !== null) url.searchParams.set("cursor", cursor);
      const page = z
        .object({
          data: z.object({ strategies: z.array(remoteStrategy) }),
          nextCursor: z.string().nullable().optional(),
        })
        .parse(await this.request(url.toString()));
      found.push(...page.data.strategies.map(toBasket));
      cursor = page.nextCursor ?? null;
      if (cursor !== null && seen.has(cursor))
        throw new Error("Glider strategy pagination repeated a cursor");
      if (cursor !== null) seen.add(cursor);
    } while (cursor !== null);
    return found;
  }

  async validate(basket: BasketDefinition): Promise<void> {
    z.object({ data: z.object({ valid: z.literal(true) }) }).parse(
      await this.request(`${BASE}/validate`, {
        method: "POST",
        body: JSON.stringify(toCreatePayload(basket)),
      }),
    );
  }

  async create(basket: BasketDefinition): Promise<string> {
    const response = z.object({ data: z.object({ strategyId: z.string().min(1) }) }).parse(
      await this.request(BASE, {
        method: "POST",
        body: JSON.stringify(toCreatePayload(basket)),
      }),
    );
    return response.data.strategyId;
  }

  async get(id: string): Promise<ProviderBasket> {
    const response = z
      .object({ data: remoteStrategy })
      .parse(await this.request(`${BASE}/${encodeURIComponent(id)}`));
    return toBasket(response.data);
  }
}
