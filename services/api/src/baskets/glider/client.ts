import createClient, { type Client } from "openapi-fetch";
import { z } from "zod";
import {
  BasketExitUnsupportedError,
  BasketRebalanceCooldownError,
  type BasketProvider,
} from "../core/deps.js";
import {
  BasketExitMessage,
  ManagedBasketOperation,
  ManagedBasketPortfolioSnapshot,
  TriggeredBasketRebalance,
  SubmittedBasketExit,
  type BasketExitMode,
  type BasketExitSubmission,
  type ManagedBasketInsights,
} from "@mercury/types";
import type {
  BasketDefinition,
  ProviderBasket,
  StrategyPerformance,
  BasketPortfolio,
  EnrollmentChallenge,
} from "../core/primitives.js";
import type { components, paths } from "./generated.js";

const BASE = "https://api.glider.fi/v2";
const SOLANA_CHAIN_ID = 1_399_811_149;
const SOLANA_USDC =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
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
const portfolioPerformance = z.object({
  data: z.object({
    portfolioId: z.string(),
    meta: z.object({ method: z.literal("MWR") }),
    summary: z
      .object({
        windows: z.array(z.object({ window: z.string(), percentChange: z.string() })),
      })
      .optional(),
  }),
});
const providerError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const breakdown = z.object({
  data: z.object({
    breakdowns: z.array(
      z.object({
        dimension: z.enum(["sector", "gliderTheme"]),
        buckets: z.array(z.object({ label: z.string(), weight: z.string(), holdingCount: z.number().int() })),
      }),
    ),
    diagnostics: z.object({
      unclassified: z.array(z.unknown()),
      unresolved: z.array(z.unknown()),
      unsupported: z.array(z.unknown()),
      lowConfidence: z.array(z.unknown()),
    }),
  }),
});
const fees = z.object({ data: z.object({ swapBps: z.number().int().nullable() }) });
const smartAccount = z.object({ accountId: z.string(), depositAccountId: z.string().optional() });
const portfolio = z.object({
  portfolioId: z.string(),
  ownerAccountId: z.string().nullable(),
  strategyId: z.string(),
  smartAccounts: z.array(smartAccount),
});
const portfolioDetail = portfolio.extend({
  ownerAccountId: z.string(),
  schedule: ManagedBasketPortfolioSnapshot.shape.schedule,
});
const positions = z.object({
  portfolioId: z.string(),
  totalValueUsd: z.string(),
  inTransit: z.object({ totalUsd: z.string() }),
  fetchedAt: z.string(),
  assets: ManagedBasketPortfolioSnapshot.shape.assets,
  warnings: ManagedBasketPortfolioSnapshot.shape.warnings,
});
const enrollmentChallenge = z.object({
  flowId: z.string(),
  accountIndex: z.string(),
  agentAccountId: z.string(),
  message: z.object({ kind: z.literal("solana-message"), text: z.string() }),
  solanaTransaction: z.string().optional(),
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

  async portfolios(ownerAccountId: string, strategyId: string): Promise<readonly BasketPortfolio[]> {
    return await this.portfoliosForOwner(ownerAccountId, strategyId);
  }

  async portfoliosForOwner(ownerAccountId: string, strategyId?: string): Promise<readonly BasketPortfolio[]> {
    const found: BasketPortfolio[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const result = await this.client.GET("/portfolios", {
        params: {
          query: {
            ownerAccountId,
            ...(strategyId ? { strategyId } : {}),
            limit: 200,
            ...(cursor ? { cursor } : {}),
          },
        },
      });
      const page = z
        .object({ data: z.object({ portfolios: z.array(portfolio) }), nextCursor: z.string().nullable() })
        .parse(this.checked(result, "/portfolios"));
      found.push(
        ...page.data.portfolios
          .filter(
            (item) =>
              item.ownerAccountId === ownerAccountId && (!strategyId || item.strategyId === strategyId),
          )
          .map((item) => ({
            portfolioId: item.portfolioId,
            ownerAccountId,
            strategyId: item.strategyId,
            smartAccounts: item.smartAccounts,
          })),
      );
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error("Glider portfolio pagination repeated a cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return found;
  }

  async portfolio(id: string) {
    const result = await this.client.GET("/portfolios/{portfolioId}", {
      params: { path: { portfolioId: id } },
    });
    return portfolioDetail.parse(this.checked(result, `/portfolios/${encodeURIComponent(id)}`).data);
  }

  async positions(id: string) {
    const result = await this.client.GET("/portfolios/{portfolioId}/positions", {
      params: { path: { portfolioId: id } },
    });
    const data = positions.parse(
      this.checked(result, `/portfolios/${encodeURIComponent(id)}/positions`).data,
    );
    return {
      portfolioId: data.portfolioId,
      totalValueUsd: data.totalValueUsd,
      inTransitUsd: data.inTransit.totalUsd,
      fetchedAt: data.fetchedAt,
      assets: data.assets,
      warnings: data.warnings,
    };
  }

  async operation(portfolioId: string, operationId: string) {
    const result = await this.client.GET("/portfolios/{portfolioId}/operations/{operationId}", {
      params: { path: { portfolioId, operationId } },
    });
    return ManagedBasketOperation.parse(
      this.checked(
        result,
        `/portfolios/${encodeURIComponent(portfolioId)}/operations/${encodeURIComponent(operationId)}`,
      ).data,
    );
  }

  async triggerRebalance(portfolioId: string) {
    const result = await this.client.POST("/portfolios/{portfolioId}/rebalance", {
      params: { path: { portfolioId } },
    });
    if (result.response.status === 429) {
      const seconds = Number(result.response.headers.get("retry-after"));
      throw new BasketRebalanceCooldownError(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    }
    return TriggeredBasketRebalance.parse(
      this.checked(result, `/portfolios/${encodeURIComponent(portfolioId)}/rebalance`).data,
    );
  }

  async prepareExit(
    portfolioId: string,
    mode: BasketExitMode,
    recipientAccountId: string,
    assets: readonly { assetId: string; amountRaw: string }[],
    submission: BasketExitSubmission,
  ) {
    const path =
      submission === "withdraw"
        ? "/portfolios/{portfolioId}/withdraw/signature"
        : "/portfolios/{portfolioId}/liquidate-all/signature";
    const result =
      submission === "withdraw"
        ? await this.client.POST("/portfolios/{portfolioId}/withdraw/signature", {
            params: { path: { portfolioId } },
            body: {
              recipientAccountId,
              assets: [...assets],
              liquidate: mode === "liquidate_usdc",
              ...(mode === "liquidate_usdc" ? { settlementAssetId: SOLANA_USDC } : {}),
            },
          })
        : await this.client.POST("/portfolios/{portfolioId}/liquidate-all/signature", {
            params: { path: { portfolioId } },
            body: { recipientAccountId, settlementAssetId: SOLANA_USDC },
          });
    const data = this.checked(result, path.replace("{portfolioId}", encodeURIComponent(portfolioId))).data;
    if (!data.authorization || data.authorization.kind !== "solana-message")
      throw new BasketExitUnsupportedError(
        "This portfolio requires an authorization this Solana wallet cannot sign.",
      );
    const message = BasketExitMessage.parse(data.authorization.message);
    if (
      message.portfolioId !== portfolioId ||
      message.recipientAccountId !== recipientAccountId ||
      Boolean(message.liquidate) !== (mode === "liquidate_usdc")
    )
      throw new Error("Glider returned an exit authorization for another portfolio, recipient, or mode.");
    return {
      expiresAt: data.expiresAt,
      authorization: { kind: "solana-message" as const, text: data.authorization.text },
      message,
    };
  }

  async submitExit(
    portfolioId: string,
    _mode: BasketExitMode,
    message: BasketExitMessage,
    signature: string,
    submission: BasketExitSubmission,
  ) {
    const path =
      submission === "withdraw"
        ? "/portfolios/{portfolioId}/withdraw"
        : "/portfolios/{portfolioId}/liquidate-all";
    // Glider signs the stage-one message. Preserve omitted optional fields verbatim;
    // its generated stage-two type marks `liquidate` required even when stage one omits it.
    const wireMessage = message as components["schemas"]["WithdrawMessage"];
    const result =
      submission === "withdraw"
        ? await this.client.POST("/portfolios/{portfolioId}/withdraw", {
            params: { path: { portfolioId } },
            body: { message: wireMessage, signature },
          })
        : await this.client.POST("/portfolios/{portfolioId}/liquidate-all", {
            params: { path: { portfolioId } },
            body: { message: wireMessage, signature },
          });
    return SubmittedBasketExit.omit({ mode: true }).parse(
      this.checked(result, path.replace("{portfolioId}", encodeURIComponent(portfolioId))).data,
    );
  }

  async prepareEnrollment(ownerAccountId: string, strategyId: string): Promise<EnrollmentChallenge> {
    const result = await this.client.POST("/enroll/signature", {
      body: { ownerAccountId, strategyId, chainIds: [SOLANA_CHAIN_ID], accountType: "ECDSA" },
    });
    return enrollmentChallenge.parse(this.checked(result, "/enroll/signature").data);
  }

  async enroll(
    ownerAccountId: string,
    strategyId: string,
    challenge: EnrollmentChallenge,
    signed: string,
    name: string,
  ): Promise<BasketPortfolio> {
    const result = await this.client.POST("/enroll", {
      body: {
        ownerAccountId,
        strategyId,
        chainIds: [SOLANA_CHAIN_ID],
        accountType: "ECDSA",
        flowId: challenge.flowId,
        accountIndex: challenge.accountIndex,
        agentAccountId: challenge.agentAccountId,
        ...(challenge.solanaTransaction ? { signedSolanaTransaction: signed } : { signature: signed }),
        portfolioName: name,
      },
    });
    const data = z
      .object({ portfolioId: z.string(), strategyId: z.string(), smartAccounts: z.array(smartAccount) })
      .parse(this.checked(result, "/enroll").data);
    if (data.strategyId !== strategyId)
      throw new Error("Glider returned a different strategy for enrollment");
    return { portfolioId: data.portfolioId, ownerAccountId, strategyId, smartAccounts: data.smartAccounts };
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

  async portfolioReturn(id: string): Promise<string | null> {
    const result = await this.client.GET("/portfolios/{portfolioId}/performance", {
      params: { path: { portfolioId: id }, query: { returnMethod: "MWR" } },
    });
    const parsed = portfolioPerformance.parse(
      this.checked(result, `/portfolios/${encodeURIComponent(id)}/performance`),
    );
    if (parsed.data.portfolioId !== id) throw new Error(`Glider performance ID mismatch: ${id}`);
    return parsed.data.summary?.windows.find((window) => window.window === "all")?.percentChange ?? null;
  }

  async allocationBreakdown(
    assets: BasketDefinition["assets"],
  ): Promise<NonNullable<ManagedBasketInsights["allocation"]>> {
    const result = await this.client.POST("/assets/allocation-breakdown", {
      body: {
        dimensions: ["sector", "gliderTheme"],
        multiCategoryMode: "primary",
        holdings: assets.map(({ assetId, weightBps }) => ({
          caipAssetId: assetId,
          weight: (weightBps / 100).toFixed(2),
        })),
      },
    });
    const parsed = breakdown.parse(this.checked(result, "/assets/allocation-breakdown"));
    const buckets = (dimension: "sector" | "gliderTheme") =>
      parsed.data.breakdowns
        .find((item) => item.dimension === dimension)
        ?.buckets.map(({ label, weight, holdingCount }) => ({
          label,
          weightPercent: Number((Number(weight) * 100).toFixed(2)).toString(),
          holdingCount,
        })) ?? [];
    return {
      sectors: buckets("sector"),
      themes: buckets("gliderTheme"),
      unclassifiedCount:
        parsed.data.diagnostics.unclassified.length +
        parsed.data.diagnostics.unresolved.length +
        parsed.data.diagnostics.unsupported.length,
      lowConfidenceCount: parsed.data.diagnostics.lowConfidence.length,
    };
  }

  async effectiveSwapFeeBps(id: string): Promise<number | null> {
    const strategy = fees.parse(
      this.checked(
        await this.client.GET("/strategies/{strategyId}/fees", {
          params: { path: { strategyId: id } },
        }),
        `/strategies/${encodeURIComponent(id)}/fees`,
      ),
    ).data.swapBps;
    if (strategy !== null) return strategy;
    return fees.parse(this.checked(await this.client.GET("/tenant/fees"), "/tenant/fees")).data.swapBps;
  }
}
