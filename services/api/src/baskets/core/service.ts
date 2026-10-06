import type { ManagedBasketInsights, ManagedBasketTemplate } from "@mercury/types";
import {
  BasketFundingPreflightError,
  type BasketFunding,
  type BasketProvider,
  type BasketStore,
} from "./deps.js";
import type { BasketDefinition, ProviderBasket, StrategyPerformance, SyncResult } from "./primitives.js";

const allocations = (assets: readonly { assetId: string; weightBps: number }[]) =>
  assets.map(({ assetId, weightBps }) => `${assetId}:${weightBps}`).sort();

export class BasketEnrollmentError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409 | 410 | 422 | 503,
    message: string,
  ) {
    super(message);
  }
}

const SOLANA_ACCOUNT = /^solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function usdcRaw(amount: string): bigint {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(amount))
    throw new BasketEnrollmentError(
      "invalid_amount",
      400,
      "Enter a valid USDC amount (up to six decimal places).",
    );
  const [whole = "0", fraction = ""] = amount.split(".");
  const raw = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (raw === 0n)
    throw new BasketEnrollmentError("invalid_amount", 400, "Enter an amount greater than zero.");
  return raw;
}

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

  constructor(
    private readonly deps: { provider?: BasketProvider; store: BasketStore; funding?: BasketFunding },
  ) {}

  private async templateForEnrollment(slug: string) {
    const template = (await this.deps.store.load()).find((item) => item.slug === slug);
    if (!template?.providerId || template.status === "disabled")
      throw new BasketEnrollmentError("enrollment_unavailable", 409, "Basket enrollment is unavailable.");
    if (!this.deps.provider)
      throw new BasketEnrollmentError("provider_unavailable", 503, "Glider is not configured.");
    return { template, provider: this.deps.provider };
  }

  async enrollment(slug: string, ownerAccountId: string) {
    const { template, provider } = await this.templateForEnrollment(slug);
    return (await provider.portfolios(ownerAccountId, template.providerId!))[0] ?? null;
  }

  async prepareFunding(slug: string, ownerAccountId: string, amountUsd: string) {
    const amountRaw = usdcRaw(amountUsd);
    const { template, provider } = await this.templateForEnrollment(slug);
    if (!this.deps.funding)
      throw new BasketEnrollmentError("funding_unavailable", 503, "Solana funding is not configured.");
    const portfolio = (await provider.portfolios(ownerAccountId, template.providerId!)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === template.providerId,
    );
    const account = portfolio?.smartAccounts.find((item) => SOLANA_ACCOUNT.test(item.accountId));
    const destinationAccountId = account?.depositAccountId ?? account?.accountId;
    if (!portfolio || !destinationAccountId || !SOLANA_ACCOUNT.test(destinationAccountId))
      throw new BasketEnrollmentError(
        "funding_unavailable",
        409,
        "No verified Solana funding account is available for this portfolio.",
      );
    let prepared;
    try {
      prepared = await this.deps.funding.prepare(ownerAccountId, destinationAccountId, amountRaw);
    } catch (error) {
      if (error instanceof BasketFundingPreflightError)
        throw new BasketEnrollmentError(
          "funding_preflight_failed",
          422,
          "The USDC transfer could not be simulated. Check your USDC and SOL balances.",
        );
      throw error;
    }
    return {
      portfolioId: portfolio.portfolioId,
      destinationAccountId,
      amountRaw: amountRaw.toString(),
      transaction: prepared.transaction,
      expiresAt: prepared.expiresAt.toISOString(),
    };
  }

  async prepareEnrollment(slug: string, userId: string, ownerAccountId: string) {
    const { template, provider } = await this.templateForEnrollment(slug);
    if ((await provider.portfolios(ownerAccountId, template.providerId!)).length > 0)
      throw new BasketEnrollmentError(
        "already_enrolled",
        409,
        "This wallet already has a portfolio for this strategy.",
      );
    const challenge = await provider.prepareEnrollment(ownerAccountId, template.providerId!);
    const expiresAt = new Date(Date.now() + (challenge.solanaTransaction ? 90_000 : 10 * 60_000));
    const intentId = await this.deps.store.saveEnrollmentIntent({
      userId,
      slug,
      ownerAccountId,
      strategyId: template.providerId!,
      challenge,
      expiresAt,
    });
    return {
      intentId,
      authorization: challenge.solanaTransaction
        ? { kind: "solana-transaction" as const, transaction: challenge.solanaTransaction }
        : challenge.message,
    };
  }

  async submitEnrollment(
    slug: string,
    userId: string,
    ownerAccountId: string,
    intentId: string,
    signed: string,
  ) {
    const { template, provider } = await this.templateForEnrollment(slug);
    const intent = await this.deps.store.enrollmentIntent(intentId);
    if (
      !intent ||
      intent.userId !== userId ||
      intent.slug !== slug ||
      intent.ownerAccountId !== ownerAccountId ||
      intent.strategyId !== template.providerId ||
      intent.expiresAt.getTime() <= Date.now()
    )
      throw new BasketEnrollmentError(
        "authorization_invalid",
        403,
        "Enrollment authorization is invalid or expired.",
      );
    if (intent.portfolioId) {
      const existing = (await provider.portfolios(ownerAccountId, intent.strategyId)).find(
        (p) => p.portfolioId === intent.portfolioId,
      );
      if (existing) return existing;
    }
    const portfolio = await provider.enroll(
      ownerAccountId,
      intent.strategyId,
      intent.challenge,
      signed,
      template.name,
    );
    await this.deps.store.completeEnrollmentIntent(intentId, portfolio.portfolioId);
    return portfolio;
  }

  async listTemplates(): Promise<readonly ManagedBasketTemplate[]> {
    const catalog = await this.deps.store.load();
    return catalog.map((template) => ({
      slug: template.slug,
      kind: "managed_portfolio" as const,
      provider: "glider" as const,
      status: template.status,
      tags: [...template.tags],
      canEnroll: template.status !== "disabled" && template.providerId !== undefined,
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
