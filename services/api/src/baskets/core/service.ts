import { isDeepStrictEqual } from "node:util";
import type {
  BasketExitAsset,
  BasketExitMessage,
  BasketExitMode,
  BasketExitSubmission,
  BasketInsights,
  Basket,
} from "@mercury/types";
import { D, ZERO } from "@mercury/core";
import { USDC_MINT, USDC_DECIMALS, type ChainHistory, type TransactionDetail } from "@mercury/chain";
import {
  BasketFundingPreflightError,
  BasketExitUnsupportedError,
  BasketRebalanceCooldownError,
  type BasketAssetSource,
  type BasketAssetStore,
  type CustomBasketStore,
  type BasketFunding,
  type BasketProvider,
  type BasketStore,
} from "./deps.js";
import { Expiring } from "./cache.js";
import {
  DESCRIPTION_MAX,
  assetIdFor,
  nameProblem,
  problemWith,
  randomSuffix,
  slugFor,
} from "./primitives.js";
import type {
  AssetSyncResult,
  BasketDefinition,
  BasketDraft,
  CuratedBasket,
  CustomBasket,
  DraftProblem,
  LiveBasket,
  ExitIntentPayload,
  PickableAsset,
  ProviderBasket,
  StrategyPerformance,
  SyncResult,
} from "./primitives.js";

const allocations = (assets: readonly { assetId: string; weightBps: number }[]) =>
  assets.map(({ assetId, weightBps }) => `${assetId}:${weightBps}`).sort();

export class BasketError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 410 | 422 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

/** A catalogue refresh offering less than this much of what we hold is not believed. */
const ASSET_SHRINK_FLOOR = 0.8;

/** How long a good answer from Glider stands, and how soon a failed one is retried. */
const FRESH_MS = 300_000;
const RETRY_MS = 30_000;
/** Enough for the whole curated shelf many times over; the cap is against unbounded growth. */
const CACHE_ENTRIES = 512;

/** What a rejected draft says. The code is the contract; this is for a person. */
const DRAFT_MESSAGES: Record<DraftProblem, string> = {
  name_required: "Give your basket a name.",
  name_too_long: "That name is too long.",
  no_assets: "Add at least one stock.",
  too_many_assets: "A basket holds at most 50 stocks.",
  duplicate_asset: "Each stock can only appear once.",
  unknown_asset: "One of those stocks cannot be held in a basket.",
  weights_must_total_10000: "Weights have to add up to 100%.",
};

const SOLANA_ACCOUNT = /^solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_ASSET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:";
const SOLANA_USDC = `${SOLANA_ASSET}${USDC_MINT}`;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const addressOf = (accountId: string) => accountId.slice(accountId.lastIndexOf(":") + 1);

/** Compare settled owner deltas, never a browser-reported amount or wallet-watcher label. */
export function verifiedBasketFunding(
  tx: TransactionDetail,
  sender: string,
  destination: string,
): bigint | null {
  if (!tx.succeeded || sender === destination || !tx.accountKeys.includes(sender)) return null;
  const balance = (side: TransactionDetail["preTokens"], owner: string) =>
    side
      .filter(
        (entry) => entry.mint === USDC_MINT && entry.owner === owner && entry.decimals === USDC_DECIMALS,
      )
      .reduce((sum, entry) => sum + entry.rawAmount, 0n);
  const debit = balance(tx.preTokens, sender) - balance(tx.postTokens, sender);
  const credit = balance(tx.postTokens, destination) - balance(tx.preTokens, destination);
  return debit > 0n && credit === debit ? debit : null;
}

function usdcRaw(amount: string): bigint {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(amount))
    throw new BasketError("invalid_amount", 400, "Enter a valid USDC amount (up to six decimal places).");
  const [whole = "0", fraction = ""] = amount.split(".");
  const raw = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (raw === 0n) throw new BasketError("invalid_amount", 400, "Enter an amount greater than zero.");
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
  /* Keyed by Glider strategy id, and a person can mint those by writing
     baskets. Bounded for that reason, not because the catalogue is large. */
  private readonly performanceCache = new Expiring<StrategyPerformance | null>(CACHE_ENTRIES);
  private readonly insightsCache = new Expiring<BasketInsights>(CACHE_ENTRIES);

  constructor(
    private readonly deps: {
      provider?: BasketProvider;
      store: BasketStore;
      /** Optional: without it the catalogue is whatever was last synced. */
      assetSource?: BasketAssetSource;
      assetStore?: BasketAssetStore;
      customBaskets?: CustomBasketStore;
      funding?: BasketFunding;
      history?: ChainHistory;
    },
  ) {}

  /*
   * Curated first; the slug suffix is what stops a custom one shadowing it.
   * One null for unknown, somebody else's, and still-a-draft alike, because
   * telling them apart would answer whether a stranger's slug exists.
   */
  private async resolve(slug: string, userId: string): Promise<LiveBasket | null> {
    const curated = (await this.deps.store.load()).find((item) => item.slug === slug);
    const basket = curated ?? (await this.deps.customBaskets?.bySlug(userId, slug));
    if (!basket?.providerId) return null;
    return { slug, name: basket.name, providerId: basket.providerId, assets: basket.assets };
  }

  private async basketFor(slug: string, userId: string) {
    const basket = await this.resolve(slug, userId);
    if (!basket) throw new BasketError("not_found", 404, "No such basket.");
    if (!this.deps.provider) throw new BasketError("provider_unavailable", 503, "Glider is not configured.");
    return { basket, provider: this.deps.provider };
  }

  /** Whether this wallet already has a portfolio here, and which one. */
  async portfolio(slug: string, userId: string, ownerAccountId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    return (await provider.portfolios(ownerAccountId, basket.providerId))[0] ?? null;
  }

  async ownedPortfolios(userId: string, ownerAccountId: string) {
    const provider = this.deps.provider;
    if (!provider) throw new BasketError("provider_unavailable", 503, "Glider is not configured.");
    const [catalog, mine, providerPortfolios, enrollments] = await Promise.all([
      this.deps.store.load(),
      this.deps.customBaskets?.mine(userId) ?? [],
      provider.portfoliosForOwner(ownerAccountId),
      this.deps.store.completedEnrollments(userId, ownerAccountId),
    ]);
    /* Curated and this owner's own alike: a portfolio whose strategy is in
       neither is not ours to describe, and stays filtered out below. */
    const byStrategy = new Map<
      string,
      { slug: string; name: string; assets: readonly { assetId: string }[] }
    >([
      ...catalog.filter((item) => item.providerId).map((item) => [item.providerId!, item] as const),
      ...mine.filter((item) => item.providerId).map((item) => [item.providerId!, item] as const),
    ]);
    const enrolledAt = new Map<string, number>();
    for (const item of enrollments) {
      const key = `${item.strategyId}:${item.portfolioId}`;
      if (!enrolledAt.has(key)) enrolledAt.set(key, item.createdAt.getTime());
    }
    const seen = new Set<string>();
    const owned = providerPortfolios
      .filter((item) => {
        if (
          item.ownerAccountId !== ownerAccountId ||
          !byStrategy.has(item.strategyId) ||
          seen.has(item.portfolioId)
        )
          return false;
        seen.add(item.portfolioId);
        return true;
      })
      .sort(
        (a, b) =>
          (enrolledAt.get(`${b.strategyId}:${b.portfolioId}`) ?? 0) -
          (enrolledAt.get(`${a.strategyId}:${a.portfolioId}`) ?? 0),
      );

    const summaries = [];
    // A wallet can own several strategies. Limit concurrent live-position reads.
    for (let offset = 0; offset < owned.length; offset += 4) {
      const batch = owned.slice(offset, offset + 4);
      summaries.push(
        ...(await Promise.all(
          batch.map(async (item) => {
            const template = byStrategy.get(item.strategyId)!;
            const base = {
              portfolioId: item.portfolioId,
              strategyId: item.strategyId,
              slug: template.slug,
              name: template.name,
              targetAssetCount: template.assets.length,
            };
            try {
              const positions = await provider.positions(item.portfolioId);
              if (positions.portfolioId !== item.portfolioId)
                throw new Error("Glider returned another portfolio's positions");
              const usdc = positions.assets.find((asset) => asset.assetId.endsWith(`/spl:${USDC_MINT}`));
              return {
                ...base,
                totalValueUsd: positions.totalValueUsd,
                usdcBalance: usdc?.balance ?? null,
                inTransitUsd: positions.inTransitUsd,
                fetchedAt: positions.fetchedAt,
                partial: positions.warnings.length > 0,
              };
            } catch (error) {
              console.warn("Glider basket positions unavailable:", item.portfolioId, error);
              return {
                ...base,
                totalValueUsd: null,
                usdcBalance: null,
                inTransitUsd: null,
                fetchedAt: null,
                partial: true,
              };
            }
          }),
        )),
      );
    }
    return summaries;
  }

  async positions(slug: string, userId: string, ownerAccountId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    const portfolios = await provider.portfolios(ownerAccountId, basket.providerId);
    const portfolio = portfolios[0];
    if (!portfolio) return null;
    if (portfolio.ownerAccountId !== ownerAccountId || portfolio.strategyId !== basket.providerId)
      throw new BasketError("portfolio_unavailable", 409, "Portfolio is unavailable for this wallet.");
    const detail = await provider.portfolio(portfolio.portfolioId);
    if (
      detail.portfolioId !== portfolio.portfolioId ||
      detail.ownerAccountId !== ownerAccountId ||
      detail.strategyId !== basket.providerId
    )
      throw new BasketError("portfolio_unavailable", 409, "Portfolio is unavailable for this wallet.");
    const positions = await provider.positions(portfolio.portfolioId);
    if (positions.portfolioId !== portfolio.portfolioId)
      throw new BasketError("portfolio_unavailable", 409, "Portfolio is unavailable for this wallet.");
    return { ...detail, ...positions };
  }

  async operation(slug: string, userId: string, ownerAccountId: string, operationId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    const portfolio = (await provider.portfolios(ownerAccountId, basket.providerId))[0];
    if (
      !portfolio ||
      portfolio.ownerAccountId !== ownerAccountId ||
      portfolio.strategyId !== basket.providerId
    )
      throw new BasketError("portfolio_unavailable", 409, "Portfolio is unavailable for this wallet.");
    const operation = await provider.operation(portfolio.portfolioId, operationId);
    if (operation.portfolioId !== portfolio.portfolioId || operation.operationId !== operationId)
      throw new BasketError("operation_unavailable", 409, "Operation is unavailable for this wallet.");
    return operation;
  }

  async rebalance(slug: string, userId: string, ownerAccountId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    const portfolio = (await provider.portfolios(ownerAccountId, basket.providerId))[0];
    if (
      !portfolio ||
      portfolio.ownerAccountId !== ownerAccountId ||
      portfolio.strategyId !== basket.providerId
    )
      throw new BasketError("portfolio_unavailable", 409, "Portfolio is unavailable for this wallet.");
    const detail = await provider.portfolio(portfolio.portfolioId);
    if (
      detail.portfolioId !== portfolio.portfolioId ||
      detail.ownerAccountId !== ownerAccountId ||
      detail.strategyId !== basket.providerId
    )
      throw new BasketError("portfolio_unavailable", 409, "Portfolio is unavailable for this wallet.");
    try {
      const triggered = await provider.triggerRebalance(portfolio.portfolioId);
      if (userId)
        await this.deps.store.saveRebalance({
          userId,
          slug,
          ownerAccountId,
          strategyId: basket.providerId,
          portfolioId: portfolio.portfolioId,
          operationId: triggered.operationId,
          submittedAt: triggered.submittedAt,
        });
      return triggered;
    } catch (error) {
      if (error instanceof BasketRebalanceCooldownError)
        throw new BasketError(
          "rebalance_cooldown",
          429,
          error.retryAfterSeconds
            ? `Rebalance is on cooldown. Try again in ${error.retryAfterSeconds} seconds.`
            : "Rebalance is on cooldown. Try again shortly.",
        );
      throw error;
    }
  }

  private async exitPortfolio(slug: string, userId: string, ownerAccountId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    const portfolio = (await provider.portfolios(ownerAccountId, basket.providerId)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === basket.providerId,
    );
    if (!portfolio)
      throw new BasketError(
        "portfolio_unavailable",
        409,
        "No portfolio belongs to this wallet and strategy.",
      );
    const detail = await provider.portfolio(portfolio.portfolioId);
    if (
      detail.portfolioId !== portfolio.portfolioId ||
      detail.ownerAccountId !== ownerAccountId ||
      detail.strategyId !== basket.providerId ||
      !detail.smartAccounts.some((item) => SOLANA_ACCOUNT.test(item.accountId))
    )
      throw new BasketError("portfolio_unavailable", 409, "The Solana portfolio could not be verified.");
    const smartAccount = detail.smartAccounts.find((item) => SOLANA_ACCOUNT.test(item.accountId));
    if (!smartAccount)
      throw new BasketError("portfolio_unavailable", 409, "The Solana portfolio could not be verified.");
    return { basket, provider, portfolio, smartAccount };
  }

  async prepareExit(
    slug: string,
    userId: string,
    ownerAccountId: string,
    mode: BasketExitMode,
    requestedAssets?: readonly BasketExitAsset[],
  ) {
    if (!SOLANA_ACCOUNT.test(ownerAccountId))
      throw new BasketError("wallet_required", 400, "A Solana wallet is required to exit.");
    const { provider, portfolio } = await this.exitPortfolio(slug, userId, ownerAccountId);
    const positions = await provider.positions(portfolio.portfolioId);
    if (positions.portfolioId !== portfolio.portfolioId)
      throw new BasketError("portfolio_unavailable", 409, "Portfolio balances could not be verified.");
    if ((mode === "in_kind" || requestedAssets) && positions.warnings.length > 0)
      throw new BasketError(
        "positions_incomplete",
        409,
        "Refresh complete portfolio balances before withdrawing assets.",
      );
    const available = positions.assets
      .filter((item) => item.assetId.startsWith(SOLANA_ASSET) && /^[1-9]\d*$/.test(item.balanceRaw))
      .map(({ assetId, balanceRaw }) => ({ assetId, amountRaw: balanceRaw }));
    const submission: BasketExitSubmission =
      mode === "liquidate_usdc" && !requestedAssets ? "liquidate_all" : "withdraw";
    const assets = requestedAssets ? [...requestedAssets] : available;
    if (assets.length === 0)
      throw new BasketError("empty_portfolio", 409, "Choose at least one asset to withdraw.");
    if (submission === "withdraw" && assets.length > 10)
      throw new BasketError("too_many_assets", 400, "Choose up to 10 assets per withdrawal.");
    if (submission === "withdraw") {
      const balances = new Map(available.map((asset) => [asset.assetId, BigInt(asset.amountRaw)]));
      const selected = new Set<string>();
      for (const asset of assets) {
        const balance = balances.get(asset.assetId);
        if (
          selected.has(asset.assetId) ||
          balance === undefined ||
          !/^[1-9]\d*$/.test(asset.amountRaw) ||
          BigInt(asset.amountRaw) > balance
        )
          throw new BasketError(
            "invalid_exit_amount",
            409,
            "Selected asset amounts are invalid or exceed the current portfolio balance. Review them again.",
          );
        selected.add(asset.assetId);
      }
    }
    try {
      const prepared = await provider.prepareExit(
        portfolio.portfolioId,
        mode,
        ownerAccountId,
        assets,
        submission,
      );
      const { message } = prepared;
      if (
        message.portfolioId !== portfolio.portfolioId ||
        message.recipientAccountId !== ownerAccountId ||
        Boolean(message.liquidate) !== (mode === "liquidate_usdc") ||
        (mode === "liquidate_usdc" && (message.settlementAssetId ?? SOLANA_USDC) !== SOLANA_USDC)
      )
        throw new Error("Glider returned an exit authorization with mismatched terms.");
      if (
        Date.parse(prepared.expiresAt) <= Date.now() + 5_000 ||
        message.expiresAt * 1000 <= Date.now() + 5_000
      )
        throw new BasketError(
          "authorization_expired",
          409,
          "The withdrawal authorization expired. Try again.",
        );
      if (
        submission === "withdraw" &&
        JSON.stringify(message.assets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId))) !==
          JSON.stringify(assets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)))
      )
        throw new Error("Glider returned a different selected asset set.");
      return {
        ...prepared,
        mode,
        submission,
        portfolioId: portfolio.portfolioId,
        recipientAccountId: ownerAccountId,
      };
    } catch (error) {
      if (error instanceof BasketExitUnsupportedError)
        throw new BasketError("unsupported_authorization", 409, error.message);
      throw error;
    }
  }

  async submitExit(
    slug: string,
    userId: string,
    ownerAccountId: string,
    mode: BasketExitMode,
    message: BasketExitMessage,
    signature: string,
    submission: BasketExitSubmission = mode === "in_kind" ? "withdraw" : "liquidate_all",
  ) {
    const { basket, provider, portfolio, smartAccount } = await this.exitPortfolio(
      slug,
      userId,
      ownerAccountId,
    );
    if (
      message.portfolioId !== portfolio.portfolioId ||
      message.recipientAccountId !== ownerAccountId ||
      Boolean(message.liquidate) !== (mode === "liquidate_usdc") ||
      (mode === "in_kind" && submission !== "withdraw") ||
      (mode === "liquidate_usdc" && (message.settlementAssetId ?? SOLANA_USDC) !== SOLANA_USDC) ||
      (mode === "in_kind" && message.settlementAssetId !== undefined)
    )
      throw new BasketError("invalid_exit", 400, "Exit terms do not match this wallet and portfolio.");
    if (message.assets.some((item) => !item.assetId.startsWith(SOLANA_ASSET)))
      throw new BasketError("invalid_exit", 400, "Exit contains an asset on another chain.");
    if (!this.deps.history)
      throw new BasketError("provider_unavailable", 503, "Solana history is not configured.");
    const authorizedAssets = message.assets.map(({ assetId, amountRaw }) => ({
      mint: assetId.slice(SOLANA_ASSET.length),
      amountRaw,
    }));
    if (new Set(authorizedAssets.map((item) => item.mint)).size !== authorizedAssets.length)
      throw new BasketError("invalid_exit", 400, "Exit contains a repeated asset.");
    const expectedTransfers: ExitIntentPayload["expectedTransfers"] =
      mode === "liquidate_usdc"
        ? [{ mint: USDC_MINT, symbol: "USDC", amountRaw: null }]
        : authorizedAssets.map(({ mint, amountRaw }) => ({
            mint,
            symbol: basket.assets.find((item) => item.assetId === `${SOLANA_ASSET}${mint}`)?.ticker ?? mint,
            amountRaw,
          }));
    let intent = await this.deps.store.exitIntent(userId, message.nonce);
    if (!intent) {
      if (message.expiresAt * 1000 <= Date.now())
        throw new BasketError(
          "authorization_expired",
          409,
          "The withdrawal authorization expired. Review it again.",
        );
      await this.deps.store.rememberBasketAccount({
        ownerAccountId,
        portfolioId: portfolio.portfolioId,
        address: addressOf(smartAccount.accountId),
      });
      const latest = await this.deps.history.signatures(addressOf(smartAccount.accountId), { limit: 1 });
      const payload: ExitIntentPayload = {
        mode,
        submission,
        smartAccountId: smartAccount.accountId,
        recipientAccountId: ownerAccountId,
        baselineSignature: latest[0]?.signature ?? null,
        authorization: { message, signature },
        authorizedAssets,
        expectedTransfers,
        templateName: basket.name,
      };
      intent = await this.deps.store.saveExitIntent({
        userId,
        slug,
        ownerAccountId,
        strategyId: basket.providerId,
        portfolioId: portfolio.portfolioId,
        nonce: message.nonce,
        expiresAt: new Date(message.expiresAt * 1000),
        payload,
      });
    }
    const expectedPayload = {
      mode,
      submission,
      smartAccountId: smartAccount.accountId,
      recipientAccountId: ownerAccountId,
      authorization: { message, signature },
      authorizedAssets,
      expectedTransfers,
      templateName: basket.name,
    };
    const savedComparable = {
      mode: intent.payload.mode,
      submission:
        intent.payload.submission ?? (intent.payload.mode === "in_kind" ? "withdraw" : "liquidate_all"),
      smartAccountId: intent.payload.smartAccountId,
      recipientAccountId: intent.payload.recipientAccountId,
      authorization: intent.payload.authorization,
      authorizedAssets: intent.payload.authorizedAssets,
      expectedTransfers: intent.payload.expectedTransfers,
      templateName: intent.payload.templateName,
    };
    if (
      intent.slug !== slug ||
      intent.ownerAccountId !== ownerAccountId ||
      intent.portfolioId !== portfolio.portfolioId ||
      !isDeepStrictEqual(savedComparable, expectedPayload)
    )
      throw new BasketError(
        "invalid_exit",
        409,
        "This withdrawal authorization was already used with different terms.",
      );
    if (intent.operationId)
      return {
        operationId: intent.operationId,
        submittedAt: intent.submittedAt?.toISOString() ?? intent.createdAt.toISOString(),
        mode,
      };
    if (message.expiresAt * 1000 <= Date.now())
      throw new BasketError(
        "authorization_expired",
        409,
        "The withdrawal authorization expired. Review it again.",
      );
    const submitted = await provider.submitExit(portfolio.portfolioId, mode, message, signature, submission);
    await this.deps.store.attachExitOperation(
      intent.id,
      submitted.operationId,
      new Date(submitted.submittedAt),
    );
    return { ...submitted, mode };
  }

  async prepareFunding(slug: string, userId: string, ownerAccountId: string, amountUsd: string) {
    const amountRaw = usdcRaw(amountUsd);
    const { basket, provider } = await this.basketFor(slug, userId);
    if (!this.deps.funding)
      throw new BasketError("funding_unavailable", 503, "Solana funding is not configured.");
    const portfolio = (await provider.portfolios(ownerAccountId, basket.providerId)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === basket.providerId,
    );
    const account = portfolio?.smartAccounts.find((item) => SOLANA_ACCOUNT.test(item.accountId));
    const destinationAccountId = account?.depositAccountId ?? account?.accountId;
    if (!portfolio || !destinationAccountId || !SOLANA_ACCOUNT.test(destinationAccountId))
      throw new BasketError(
        "funding_unavailable",
        409,
        "No verified Solana funding account is available for this portfolio.",
      );
    // Before the transfer is even built, so the wallet-events job can recognise
    // the money when it moves rather than reading it as cash leaving the account.
    await this.deps.store.rememberBasketAccount({
      ownerAccountId,
      portfolioId: portfolio.portfolioId,
      address: addressOf(destinationAccountId),
    });

    let prepared;
    try {
      prepared = await this.deps.funding.prepare(ownerAccountId, destinationAccountId, amountRaw);
    } catch (error) {
      if (error instanceof BasketFundingPreflightError)
        throw new BasketError(
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

  async confirmFunding(slug: string, userId: string, ownerAccountId: string, signature: string) {
    if (!SIGNATURE.test(signature))
      throw new BasketError("invalid_signature", 400, "Enter a valid Solana transaction signature.");
    if (!this.deps.history)
      throw new BasketError("funding_unavailable", 503, "Solana history is not configured.");
    const { basket, provider } = await this.basketFor(slug, userId);
    const portfolio = (await provider.portfolios(ownerAccountId, basket.providerId)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === basket.providerId,
    );
    const account = portfolio?.smartAccounts.find((item) => SOLANA_ACCOUNT.test(item.accountId));
    const destinationAccountId = account?.depositAccountId ?? account?.accountId;
    if (!portfolio || !destinationAccountId || !SOLANA_ACCOUNT.test(destinationAccountId))
      throw new BasketError("portfolio_unavailable", 409, "No verified funding account is available.");
    const tx = await this.deps.history.transaction(signature);
    if (!tx)
      throw new BasketError("transaction_pending", 409, "Transaction is not settled yet. Try again shortly.");
    if (tx.signature !== signature)
      throw new BasketError("invalid_transaction", 422, "Transaction signature did not match.");
    const amountRaw = verifiedBasketFunding(tx, addressOf(ownerAccountId), addressOf(destinationAccountId));
    if (amountRaw === null)
      throw new BasketError(
        "invalid_transaction",
        422,
        "Transaction did not transfer USDC from your wallet to this portfolio's smart account.",
      );
    await this.deps.store.confirmFunding({
      userId,
      slug,
      portfolioId: portfolio.portfolioId,
      title: `Funded ${basket.name}`,
      signature,
      mint: USDC_MINT,
      amountRaw,
      occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1000),
    });
    return { portfolioId: portfolio.portfolioId, signature, amountRaw: amountRaw.toString() };
  }

  async activity(slug: string, userId: string, ownerAccountId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    const portfolio = (await provider.portfolios(ownerAccountId, basket.providerId)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === basket.providerId,
    );
    if (!portfolio) return [];
    const [actions, funding, settlements] = await Promise.all([
      this.deps.store.recentActions(userId, portfolio.portfolioId),
      this.deps.store.recentFunding(userId, portfolio.portfolioId),
      this.deps.store.recentSettlements(userId, portfolio.portfolioId),
    ]);
    const rows = await Promise.all(
      actions.map(async (action, index) => {
        let state: string | null = null;
        // The rail shows five events; avoid one provider request per historical operation.
        if (index < 5 && action.kind !== "enroll" && action.operationId) {
          try {
            const operation = await provider.operation(portfolio.portfolioId, action.operationId);
            if (operation.portfolioId === portfolio.portfolioId) state = operation.state;
          } catch {
            /* Keep the durable submission visible when Glider is temporarily unavailable. */
          }
        }
        return {
          id: action.id,
          kind: action.kind,
          occurredAt: action.createdAt.toISOString(),
          title:
            action.kind === "enroll"
              ? `Enrolled in ${basket.name}`
              : action.kind === "withdraw_in_kind"
                ? `Withdrew ${basket.name} assets`
                : action.kind === "liquidate_to_usdc"
                  ? `Exited ${basket.name} to USDC`
                  : "Manual rebalance",
          subtitle: action.kind === "enroll" ? "Portfolio created" : (state ?? "Status unavailable"),
          amountUsd: null,
          tokenQuantity: null,
          txSignature: null,
        };
      }),
    );
    return [
      ...rows,
      ...funding.map((item) => ({
        id: item.id,
        kind: "basket_funding",
        occurredAt: item.occurredAt.toISOString(),
        title: item.title,
        subtitle: "Transfer between your accounts",
        amountUsd: item.amountUsd,
        tokenQuantity: null,
        txSignature: item.txSignature,
      })),
      ...settlements.map((item) => ({
        id: item.id,
        kind: item.kind,
        occurredAt: item.occurredAt.toISOString(),
        title: item.title,
        subtitle: item.subtitle ?? "Settled transfer",
        amountUsd: item.amountUsd,
        tokenQuantity: item.tokenQuantity,
        txSignature: item.txSignature,
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 20);
  }

  async prepareEnrollment(slug: string, userId: string, ownerAccountId: string) {
    const { basket, provider } = await this.basketFor(slug, userId);
    if ((await provider.portfolios(ownerAccountId, basket.providerId)).length > 0)
      throw new BasketError(
        "already_enrolled",
        409,
        "This wallet already has a portfolio for this strategy.",
      );
    const challenge = await provider.prepareEnrollment(ownerAccountId, basket.providerId);
    const expiresAt = new Date(Date.now() + (challenge.solanaTransaction ? 90_000 : 10 * 60_000));
    const intentId = await this.deps.store.saveEnrollmentIntent({
      userId,
      slug,
      ownerAccountId,
      strategyId: basket.providerId,
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
    const { basket, provider } = await this.basketFor(slug, userId);
    const intent = await this.deps.store.enrollmentIntent(intentId);
    if (
      !intent ||
      intent.userId !== userId ||
      intent.slug !== slug ||
      intent.ownerAccountId !== ownerAccountId ||
      intent.strategyId !== basket.providerId ||
      intent.expiresAt.getTime() <= Date.now()
    )
      throw new BasketError("authorization_invalid", 403, "Enrollment authorization is invalid or expired.");
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
      basket.name,
    );
    await this.deps.store.completeEnrollmentIntent(intentId, portfolio.portfolioId);
    return portfolio;
  }

  private customBasketStore(): CustomBasketStore {
    if (this.deps.customBaskets === undefined)
      throw new BasketError("provider_unavailable", 503, "Custom baskets are not configured.");
    return this.deps.customBaskets;
  }

  /*
   * Glider gets the slug as the name. Recovery finds a strategy by name, and
   * two people will both write a "My AI Bet"; slugs are unique, names are not.
   */
  private static definitionFor(basket: CustomBasket): BasketDefinition {
    return {
      slug: basket.slug,
      providerId: basket.providerId,
      name: basket.slug,
      description: basket.description,
      assets: basket.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps })),
      schedule: { type: "interval", frequency: "daily" },
    };
  }

  /** `sync()`'s steps, recovery included: a dead connection may still have created it. */
  private async publish(basket: CustomBasket, provider: BasketProvider): Promise<string> {
    const definition = BasketService.definitionFor(basket);
    await provider.validate(definition);
    let strategyId: string;
    try {
      strategyId = await provider.create(definition);
    } catch (error) {
      const namesakes = (await provider.list()).filter((item) => item.name === definition.name);
      if (namesakes.length !== 1 || !matches(definition, namesakes[0]!)) throw error;
      strategyId = namesakes[0]!.id;
    }
    const readback = await provider.get(strategyId);
    // Plain, so the route logs it: Glider holds something we did not ask for.
    if (readback.id !== strategyId || !matches(definition, readback))
      throw new Error(`Glider stored a different basket for ${definition.slug}`);
    await this.customBasketStore().attachStrategy(basket.id, strategyId);
    return strategyId;
  }

  /** The row lands first, so a half-failed create leaves a draft to retry. */
  async create(userId: string, draft: BasketDraft): Promise<Basket> {
    const catalogue = await this.assetStore().all();
    const byAssetId = new Map(catalogue.map((asset) => [assetIdFor(asset.mint), asset]));
    const problem = problemWith(draft, new Set(byAssetId.keys()));
    if (problem !== null) throw new BasketError(problem, 422, DRAFT_MESSAGES[problem]);

    const basket = await this.customBasketStore().draft({
      userId,
      slug: slugFor(draft.name, randomSuffix()),
      name: draft.name.trim(),
      description: draft.description.trim().slice(0, DESCRIPTION_MAX),
      assets: draft.assets.map(({ assetId, weightBps }) => ({
        assetId,
        ticker: byAssetId.get(assetId)!.ticker,
        weightBps,
      })),
    });
    if (!this.deps.provider) throw new BasketError("provider_unavailable", 503, "Glider is not configured.");
    const providerId = await this.publish(basket, this.deps.provider);
    return BasketService.mineWire({ ...basket, providerId });
  }

  /** Resolve one of the caller's own, or say why not. Curated slugs are not theirs to edit. */
  private async mine(slug: string, userId: string): Promise<CustomBasket> {
    const curated = (await this.deps.store.load()).some((item) => item.slug === slug);
    if (curated) throw new BasketError("not_yours", 403, "This basket is not yours to change.");
    const basket = await this.customBasketStore().bySlug(userId, slug);
    if (basket === null) throw new BasketError("not_found", 404, "No such basket.");
    return basket;
  }

  /**
   * A write at Glider, believed only once it reads back.
   *
   * A dropped connection may still have applied it, and our row must not
   * drift: the next edit compares against what we think is published.
   */
  private async confirmed(
    strategyId: string,
    definition: BasketDefinition,
    provider: BasketProvider,
    write: () => Promise<void>,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (!matches(definition, await provider.get(strategyId))) throw error;
      return;
    }
    if (!matches(definition, await provider.get(strategyId)))
      throw new Error(`Glider stored a different basket for ${definition.slug}`);
  }

  /** Local: Glider holds the slug, fixed at creation, so there is nothing there to change. */
  async rename(
    userId: string,
    slug: string,
    changes: { name?: string | undefined; description?: string | undefined },
  ): Promise<Basket> {
    const basket = await this.mine(slug, userId);
    const name = (changes.name ?? basket.name).trim();
    const problem = nameProblem(name);
    if (problem !== null) throw new BasketError(problem, 422, DRAFT_MESSAGES[problem]);
    const next = {
      name,
      description: (changes.description ?? basket.description).trim().slice(0, DESCRIPTION_MAX),
    };
    await this.customBasketStore().rename(basket.id, next.name, next.description);
    return BasketService.mineWire({ ...basket, ...next });
  }

  /**
   * No money moves: every portfolio rebalances to it on its next run, and the
   * detail page already offers a manual one for anyone impatient.
   */
  async reviseAssets(userId: string, slug: string, assets: BasketDraft["assets"]): Promise<Basket> {
    const basket = await this.mine(slug, userId);
    const catalogue = await this.assetStore().all();
    const byAssetId = new Map(catalogue.map((asset) => [assetIdFor(asset.mint), asset]));
    const problem = problemWith({ ...basket, assets }, new Set(byAssetId.keys()));
    if (problem !== null) throw new BasketError(problem, 422, DRAFT_MESSAGES[problem]);

    const next = assets.map(({ assetId, weightBps }) => ({
      assetId,
      ticker: byAssetId.get(assetId)!.ticker,
      weightBps,
    }));
    // A draft has no strategy yet; whatever it holds goes up when it is created.
    if (basket.providerId !== null) {
      if (!this.deps.provider)
        throw new BasketError("provider_unavailable", 503, "Glider is not configured.");
      const provider = this.deps.provider;
      const strategyId = basket.providerId;
      const definition = BasketService.definitionFor({ ...basket, assets: next });
      await this.confirmed(strategyId, definition, provider, () =>
        provider.publishAllocation(strategyId, definition.assets),
      );
    }
    await this.customBasketStore().reviseAssets(basket.id, next);
    return BasketService.mineWire({ ...basket, assets: next });
  }

  /**
   * Refused while funded, in-transit included: Glider cannot delete a
   * strategy, so money left behind sits where the app no longer shows it.
   */
  async remove(userId: string, slug: string, ownerAccountId: string): Promise<void> {
    const basket = await this.mine(slug, userId);
    if (basket.providerId !== null && this.deps.provider) {
      const portfolio = (await this.deps.provider.portfolios(ownerAccountId, basket.providerId))[0];
      if (portfolio) {
        const held = await this.deps.provider.positions(portfolio.portfolioId);
        if (D(held.totalValueUsd).gt(ZERO) || D(held.inTransitUsd).gt(ZERO))
          throw new BasketError("basket_funded", 409, "Withdraw everything before deleting a basket.");
      }
    }
    await this.customBasketStore().remove(basket.id);
  }

  /** Glider holds the mint inside the asset id; every client wants it on its own. */
  private static allocations(
    assets: readonly { ticker: string; assetId: string; weightBps: number }[],
  ): Basket["allocations"] {
    return assets.map(({ ticker, assetId, weightBps }) => {
      const mint = assetId.split("/spl:")[1];
      if (mint === undefined) throw new Error(`Invalid Solana asset ID: ${assetId}`);
      return { ticker, mint, assetId, weightBps };
    });
  }

  private static curatedWire(basket: CuratedBasket): Basket {
    return {
      source: "curated",
      tags: [...basket.tags],
      slug: basket.slug,
      name: basket.name,
      description: basket.description,
      strategyId: basket.providerId,
      schedule: basket.schedule,
      allocations: BasketService.allocations(basket.assets),
      performance: null,
    };
  }

  private static mineWire(basket: CustomBasket): Basket {
    return {
      source: "mine",
      createdAt: basket.createdAt.toISOString(),
      updatedAt: basket.updatedAt.toISOString(),
      slug: basket.slug,
      name: basket.name,
      description: basket.description,
      strategyId: basket.providerId,
      schedule: { type: "interval", frequency: "daily" },
      allocations: BasketService.allocations(basket.assets),
      performance: null,
    };
  }

  /** One list, not two requests: matching a portfolio to its basket has to look in both. */
  async list(userId: string): Promise<readonly Basket[]> {
    const [catalog, mine] = await Promise.all([
      this.deps.store.load(),
      this.deps.customBaskets?.mine(userId) ?? [],
    ]);
    return [...catalog.map(BasketService.curatedWire), ...mine.map(BasketService.mineWire)];
  }

  async detail(slug: string, userId: string): Promise<Basket | null> {
    const curated = (await this.deps.store.load()).find((item) => item.slug === slug);
    const mine = curated ? null : await this.deps.customBaskets?.bySlug(userId, slug);
    const basket = curated ? BasketService.curatedWire(curated) : mine ? BasketService.mineWire(mine) : null;
    if (basket === null) return null;
    const performance = await this.strategyPerformance(basket.strategyId);
    return {
      ...basket,
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

  async insights(slug: string, userId: string): Promise<BasketInsights | null> {
    const curated = (await this.deps.store.load()).find((item) => item.slug === slug);
    const basket = curated ?? (await this.deps.customBaskets?.bySlug(userId, slug)) ?? null;
    if (basket === null) return null;
    const empty: BasketInsights = { allocation: null, integratorSwapFeeBps: null };
    if (this.deps.provider === undefined || basket.providerId === null) return empty;
    const cached = this.insightsCache.get(basket.providerId);
    if (cached !== undefined) return cached;
    const provider = this.deps.provider;
    const [allocation, fee] = await Promise.allSettled([
      provider.allocationBreakdown(basket.assets),
      provider.effectiveSwapFeeBps(basket.providerId),
    ]);
    const value: BasketInsights = {
      allocation: allocation.status === "fulfilled" ? allocation.value : null,
      integratorSwapFeeBps: fee.status === "fulfilled" ? fee.value : null,
    };
    if (allocation.status === "rejected")
      console.warn("Glider allocation breakdown unavailable:", slug, allocation.reason);
    if (fee.status === "rejected") console.warn("Glider strategy fee unavailable:", slug, fee.reason);
    const complete = allocation.status === "fulfilled" && fee.status === "fulfilled";
    this.insightsCache.set(basket.providerId, value, complete ? FRESH_MS : RETRY_MS);
    return value;
  }

  private async strategyPerformance(id: string | null): Promise<StrategyPerformance | null> {
    if (this.deps.provider === undefined || id === null) return null;
    /* `undefined` is a miss; a cached `null` is Glider having no curve for
       this strategy, which is worth remembering for the shorter while. */
    const cached = this.performanceCache.get(id);
    if (cached !== undefined) return cached;
    try {
      const value = await this.deps.provider.strategyPerformance(id);
      this.performanceCache.set(id, value, FRESH_MS);
      return value;
    } catch (error) {
      console.warn("Glider strategy performance unavailable:", id, error);
      this.performanceCache.set(id, null, RETRY_MS);
      return null;
    }
  }

  /** A few hundred rows, changed once a day, so typing filters the browser's copy. */
  private assetStore(): BasketAssetStore {
    if (this.deps.assetStore === undefined) throw new Error("Basket asset store is not configured");
    return this.deps.assetStore;
  }

  async pickableAssets(): Promise<readonly PickableAsset[]> {
    const assets = await this.assetStore().all();
    return assets.map(({ ticker, name, mint, logoUrl }) => ({
      ticker,
      name,
      assetId: assetIdFor(mint),
      logoUrl,
    }));
  }

  /*
   * A pass removes as well as adds, so a half-failed page would empty the
   * picker under somebody mid-choice. Below four fifths, the old rows stand.
   * A judgement about trust rather than storage, which is why it is not in the store.
   */
  async syncAssets(): Promise<AssetSyncResult> {
    if (this.deps.assetSource === undefined) throw new Error("Basket asset source is not configured");
    const store = this.assetStore();
    const offered = await this.deps.assetSource.list();
    const held = await store.count();
    if (held > 0 && offered.length < held * ASSET_SHRINK_FLOOR) {
      return { written: 0, offered: offered.length, held: true };
    }
    return { written: await store.replace(offered), offered: offered.length, held: false };
  }

  async sync(): Promise<SyncResult> {
    if (this.deps.provider === undefined) throw new Error("Glider provider is not configured");
    const provider = this.deps.provider;
    const catalog = await this.deps.store.load();
    if (catalog.every((basket) => basket.providerId !== null)) {
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
        if (definition.providerId !== null) {
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
