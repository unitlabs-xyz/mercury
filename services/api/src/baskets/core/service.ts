import type {
  BasketExitMessage,
  BasketExitMode,
  ManagedBasketInsights,
  ManagedBasketTemplate,
} from "@mercury/types";
import { USDC_MINT, USDC_DECIMALS, type ChainHistory, type TransactionDetail } from "@mercury/chain";
import {
  BasketFundingPreflightError,
  BasketExitUnsupportedError,
  BasketRebalanceCooldownError,
  type BasketFunding,
  type BasketProvider,
  type BasketStore,
} from "./deps.js";
import type {
  BasketDefinition,
  ExitIntentPayload,
  ProviderBasket,
  StrategyPerformance,
  SyncResult,
} from "./primitives.js";

const allocations = (assets: readonly { assetId: string; weightBps: number }[]) =>
  assets.map(({ assetId, weightBps }) => `${assetId}:${weightBps}`).sort();

export class BasketEnrollmentError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409 | 410 | 422 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

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
    private readonly deps: {
      provider?: BasketProvider;
      store: BasketStore;
      funding?: BasketFunding;
      history?: ChainHistory;
    },
  ) {}

  private async templateForRead(slug: string) {
    const template = (await this.deps.store.load()).find((item) => item.slug === slug);
    if (!template?.providerId)
      throw new BasketEnrollmentError("enrollment_unavailable", 409, "Basket enrollment is unavailable.");
    if (!this.deps.provider)
      throw new BasketEnrollmentError("provider_unavailable", 503, "Glider is not configured.");
    return { template, provider: this.deps.provider };
  }

  private async templateForEnrollment(slug: string) {
    const resolved = await this.templateForRead(slug);
    if (resolved.template.status === "disabled")
      throw new BasketEnrollmentError("enrollment_unavailable", 409, "Basket enrollment is unavailable.");
    return resolved;
  }

  async enrollment(slug: string, ownerAccountId: string) {
    const { template, provider } = await this.templateForRead(slug);
    return (await provider.portfolios(ownerAccountId, template.providerId!))[0] ?? null;
  }

  async ownedPortfolios(userId: string, ownerAccountId: string) {
    const provider = this.deps.provider;
    if (!provider) throw new BasketEnrollmentError("provider_unavailable", 503, "Glider is not configured.");
    const [catalog, providerPortfolios, enrollments] = await Promise.all([
      this.deps.store.load(),
      provider.portfoliosForOwner(ownerAccountId),
      this.deps.store.completedEnrollments(userId, ownerAccountId),
    ]);
    const byStrategy = new Map(
      catalog.filter((item) => item.providerId).map((item) => [item.providerId!, item]),
    );
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

  async portfolioSnapshot(slug: string, ownerAccountId: string) {
    const { template, provider } = await this.templateForRead(slug);
    const portfolios = await provider.portfolios(ownerAccountId, template.providerId!);
    const portfolio = portfolios[0];
    if (!portfolio) return null;
    if (portfolio.ownerAccountId !== ownerAccountId || portfolio.strategyId !== template.providerId)
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio is unavailable for this wallet.",
      );
    const detail = await provider.portfolio(portfolio.portfolioId);
    if (
      detail.portfolioId !== portfolio.portfolioId ||
      detail.ownerAccountId !== ownerAccountId ||
      detail.strategyId !== template.providerId
    )
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio is unavailable for this wallet.",
      );
    const positions = await provider.positions(portfolio.portfolioId);
    if (positions.portfolioId !== portfolio.portfolioId)
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio is unavailable for this wallet.",
      );
    return { ...detail, ...positions };
  }

  async operation(slug: string, ownerAccountId: string, operationId: string) {
    const { template, provider } = await this.templateForRead(slug);
    const portfolio = (await provider.portfolios(ownerAccountId, template.providerId!))[0];
    if (
      !portfolio ||
      portfolio.ownerAccountId !== ownerAccountId ||
      portfolio.strategyId !== template.providerId
    )
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio is unavailable for this wallet.",
      );
    const operation = await provider.operation(portfolio.portfolioId, operationId);
    if (operation.portfolioId !== portfolio.portfolioId || operation.operationId !== operationId)
      throw new BasketEnrollmentError(
        "operation_unavailable",
        409,
        "Operation is unavailable for this wallet.",
      );
    return operation;
  }

  async rebalance(slug: string, ownerAccountId: string, userId?: string) {
    const { template, provider } = await this.templateForEnrollment(slug);
    const portfolio = (await provider.portfolios(ownerAccountId, template.providerId!))[0];
    if (
      !portfolio ||
      portfolio.ownerAccountId !== ownerAccountId ||
      portfolio.strategyId !== template.providerId
    )
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio is unavailable for this wallet.",
      );
    const detail = await provider.portfolio(portfolio.portfolioId);
    if (
      detail.portfolioId !== portfolio.portfolioId ||
      detail.ownerAccountId !== ownerAccountId ||
      detail.strategyId !== template.providerId
    )
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio is unavailable for this wallet.",
      );
    try {
      const triggered = await provider.triggerRebalance(portfolio.portfolioId);
      if (userId)
        await this.deps.store.saveRebalance({
          userId,
          slug,
          ownerAccountId,
          strategyId: template.providerId!,
          portfolioId: portfolio.portfolioId,
          operationId: triggered.operationId,
          submittedAt: triggered.submittedAt,
        });
      return triggered;
    } catch (error) {
      if (error instanceof BasketRebalanceCooldownError)
        throw new BasketEnrollmentError(
          "rebalance_cooldown",
          429,
          error.retryAfterSeconds
            ? `Rebalance is on cooldown. Try again in ${error.retryAfterSeconds} seconds.`
            : "Rebalance is on cooldown. Try again shortly.",
        );
      throw error;
    }
  }

  private async exitPortfolio(slug: string, ownerAccountId: string) {
    const { template, provider } = await this.templateForRead(slug);
    const portfolio = (await provider.portfolios(ownerAccountId, template.providerId!)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === template.providerId,
    );
    if (!portfolio)
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "No portfolio belongs to this wallet and strategy.",
      );
    const detail = await provider.portfolio(portfolio.portfolioId);
    if (
      detail.portfolioId !== portfolio.portfolioId ||
      detail.ownerAccountId !== ownerAccountId ||
      detail.strategyId !== template.providerId ||
      !detail.smartAccounts.some((item) => SOLANA_ACCOUNT.test(item.accountId))
    )
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "The Solana portfolio could not be verified.",
      );
    const smartAccount = detail.smartAccounts.find((item) => SOLANA_ACCOUNT.test(item.accountId));
    if (!smartAccount)
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "The Solana portfolio could not be verified.",
      );
    return { template, provider, portfolio, smartAccount };
  }

  async prepareExit(slug: string, ownerAccountId: string, mode: BasketExitMode) {
    if (!SOLANA_ACCOUNT.test(ownerAccountId))
      throw new BasketEnrollmentError("wallet_required", 400, "A Solana wallet is required to exit.");
    const { provider, portfolio } = await this.exitPortfolio(slug, ownerAccountId);
    const positions = await provider.positions(portfolio.portfolioId);
    if (positions.portfolioId !== portfolio.portfolioId)
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "Portfolio balances could not be verified.",
      );
    if (mode === "in_kind" && positions.warnings.length > 0)
      throw new BasketEnrollmentError(
        "positions_incomplete",
        409,
        "Refresh complete portfolio balances before withdrawing assets.",
      );
    const assets = positions.assets
      .filter((item) => item.assetId.startsWith(SOLANA_ASSET) && /^[1-9]\d*$/.test(item.balanceRaw))
      .map(({ assetId, balanceRaw }) => ({ assetId, amountRaw: balanceRaw }));
    if (assets.length === 0)
      throw new BasketEnrollmentError(
        "empty_portfolio",
        409,
        "There are no Solana assets available to withdraw.",
      );
    try {
      const prepared = await provider.prepareExit(portfolio.portfolioId, mode, ownerAccountId, assets);
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
        throw new BasketEnrollmentError(
          "authorization_expired",
          409,
          "The withdrawal authorization expired. Try again.",
        );
      if (
        mode === "in_kind" &&
        JSON.stringify(message.assets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId))) !==
          JSON.stringify(assets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId)))
      )
        throw new Error("Glider returned a different in-kind asset set.");
      return { ...prepared, mode, portfolioId: portfolio.portfolioId, recipientAccountId: ownerAccountId };
    } catch (error) {
      if (error instanceof BasketExitUnsupportedError)
        throw new BasketEnrollmentError("unsupported_authorization", 409, error.message);
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
  ) {
    const { template, provider, portfolio, smartAccount } = await this.exitPortfolio(slug, ownerAccountId);
    if (
      message.portfolioId !== portfolio.portfolioId ||
      message.recipientAccountId !== ownerAccountId ||
      Boolean(message.liquidate) !== (mode === "liquidate_usdc") ||
      (mode === "liquidate_usdc" && (message.settlementAssetId ?? SOLANA_USDC) !== SOLANA_USDC) ||
      (mode === "in_kind" && message.settlementAssetId !== undefined)
    )
      throw new BasketEnrollmentError(
        "invalid_exit",
        400,
        "Exit terms do not match this wallet and portfolio.",
      );
    if (message.assets.some((item) => !item.assetId.startsWith(SOLANA_ASSET)))
      throw new BasketEnrollmentError("invalid_exit", 400, "Exit contains an asset on another chain.");
    if (!this.deps.history)
      throw new BasketEnrollmentError("provider_unavailable", 503, "Solana history is not configured.");
    const authorizedAssets = message.assets.map(({ assetId, amountRaw }) => ({
      mint: assetId.slice(SOLANA_ASSET.length),
      amountRaw,
    }));
    if (new Set(authorizedAssets.map((item) => item.mint)).size !== authorizedAssets.length)
      throw new BasketEnrollmentError("invalid_exit", 400, "Exit contains a repeated asset.");
    const expectedTransfers: ExitIntentPayload["expectedTransfers"] =
      mode === "liquidate_usdc"
        ? [{ mint: USDC_MINT, symbol: "USDC", amountRaw: null }]
        : authorizedAssets.map(({ mint, amountRaw }) => ({
            mint,
            symbol: template.assets.find((item) => item.assetId === `${SOLANA_ASSET}${mint}`)?.ticker ?? mint,
            amountRaw,
          }));
    let intent = await this.deps.store.exitIntent(userId, message.nonce);
    if (!intent) {
      if (message.expiresAt * 1000 <= Date.now())
        throw new BasketEnrollmentError(
          "authorization_expired",
          409,
          "The withdrawal authorization expired. Review it again.",
        );
      const latest = await this.deps.history.signatures(addressOf(smartAccount.accountId), { limit: 1 });
      const payload: ExitIntentPayload = {
        mode,
        smartAccountId: smartAccount.accountId,
        recipientAccountId: ownerAccountId,
        baselineSignature: latest[0]?.signature ?? null,
        authorization: { message, signature },
        authorizedAssets,
        expectedTransfers,
        templateName: template.name,
      };
      intent = await this.deps.store.saveExitIntent({
        userId,
        slug,
        ownerAccountId,
        strategyId: template.providerId!,
        portfolioId: portfolio.portfolioId,
        nonce: message.nonce,
        expiresAt: new Date(message.expiresAt * 1000),
        payload,
      });
    }
    const expectedPayload = {
      mode,
      smartAccountId: smartAccount.accountId,
      recipientAccountId: ownerAccountId,
      authorization: { message, signature },
      authorizedAssets,
      expectedTransfers,
      templateName: template.name,
    };
    const savedComparable = {
      mode: intent.payload.mode,
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
      JSON.stringify(savedComparable) !== JSON.stringify(expectedPayload)
    )
      throw new BasketEnrollmentError(
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
      throw new BasketEnrollmentError(
        "authorization_expired",
        409,
        "The withdrawal authorization expired. Review it again.",
      );
    const submitted = await provider.submitExit(portfolio.portfolioId, mode, message, signature);
    await this.deps.store.attachExitOperation(
      intent.id,
      submitted.operationId,
      new Date(submitted.submittedAt),
    );
    return { ...submitted, mode };
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

  async confirmFunding(slug: string, userId: string, ownerAccountId: string, signature: string) {
    if (!SIGNATURE.test(signature))
      throw new BasketEnrollmentError(
        "invalid_signature",
        400,
        "Enter a valid Solana transaction signature.",
      );
    if (!this.deps.history)
      throw new BasketEnrollmentError("funding_unavailable", 503, "Solana history is not configured.");
    const { template, provider } = await this.templateForRead(slug);
    const portfolio = (await provider.portfolios(ownerAccountId, template.providerId!)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === template.providerId,
    );
    const account = portfolio?.smartAccounts.find((item) => SOLANA_ACCOUNT.test(item.accountId));
    const destinationAccountId = account?.depositAccountId ?? account?.accountId;
    if (!portfolio || !destinationAccountId || !SOLANA_ACCOUNT.test(destinationAccountId))
      throw new BasketEnrollmentError(
        "portfolio_unavailable",
        409,
        "No verified funding account is available.",
      );
    const tx = await this.deps.history.transaction(signature);
    if (!tx)
      throw new BasketEnrollmentError(
        "transaction_pending",
        409,
        "Transaction is not settled yet. Try again shortly.",
      );
    if (tx.signature !== signature)
      throw new BasketEnrollmentError("invalid_transaction", 422, "Transaction signature did not match.");
    const amountRaw = verifiedBasketFunding(tx, addressOf(ownerAccountId), addressOf(destinationAccountId));
    if (amountRaw === null)
      throw new BasketEnrollmentError(
        "invalid_transaction",
        422,
        "Transaction did not transfer USDC from your wallet to this portfolio's smart account.",
      );
    await this.deps.store.confirmFunding({
      userId,
      slug,
      portfolioId: portfolio.portfolioId,
      title: `Funded ${template.name}`,
      signature,
      mint: USDC_MINT,
      amountRaw,
      occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1000),
    });
    return { portfolioId: portfolio.portfolioId, signature, amountRaw: amountRaw.toString() };
  }

  async activity(slug: string, userId: string, ownerAccountId: string) {
    const { template, provider } = await this.templateForRead(slug);
    const portfolio = (await provider.portfolios(ownerAccountId, template.providerId!)).find(
      (item) => item.ownerAccountId === ownerAccountId && item.strategyId === template.providerId,
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
              ? `Enrolled in ${template.name}`
              : action.kind === "withdraw_in_kind"
                ? `Withdrew ${template.name} assets`
                : action.kind === "liquidate_to_usdc"
                  ? `Exited ${template.name} to USDC`
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
