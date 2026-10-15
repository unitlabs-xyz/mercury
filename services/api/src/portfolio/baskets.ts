import { D, toWire, ZERO, type Decimal } from "@mercury/core";
import type { BasketProvider, BasketStore, CustomBasketStore } from "../baskets/core/deps.js";

const SOLANA_OWNER = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:";

export class BasketValuationError extends Error {
  readonly code = "basket_value_unavailable";
}

export interface ValuedBasket {
  readonly portfolioId: string;
  readonly slug: string | null;
  readonly name: string;
  readonly valueUsd: string;
  readonly inTransitUsd: string;
  readonly fetchedAt: string;
  readonly holdings: readonly {
    assetId: string;
    symbol: string;
    ticker: string | null;
    balance: string;
    valueUsd: string;
  }[];
}

export interface BasketValue {
  readonly totalUsd: Decimal;
  readonly baskets: readonly ValuedBasket[];
  readonly fetchedAt: Date | null;
}

export type BasketValueReader = (userId: string, walletAddress: string) => Promise<BasketValue>;
export type BasketReturnsReader = (walletAddress: string) => Promise<
  readonly {
    portfolioId: string;
    percentChange: string | null;
  }[]
>;

export function basketReturnsReader(provider: BasketProvider | undefined): BasketReturnsReader {
  return async (walletAddress) => {
    if (!provider) return [];
    const owner = `${SOLANA_OWNER}${walletAddress}`;
    const portfolios = await provider.portfoliosForOwner(owner);
    if (portfolios.some((portfolio) => portfolio.ownerAccountId !== owner))
      throw new BasketValuationError("Glider returned a portfolio for another owner.");
    return Promise.all(
      portfolios.map(async ({ portfolioId }) => ({
        portfolioId,
        percentChange: await provider.portfolioReturn(portfolioId),
      })),
    );
  };
}

const money = (value: string): Decimal => {
  const amount = D(value);
  if (!amount.isFinite() || amount.lt(ZERO))
    throw new BasketValuationError("Glider returned an invalid basket value.");
  return amount;
};

export function basketValueReader(
  provider: BasketProvider | undefined,
  store: BasketStore,
  custom?: CustomBasketStore,
): BasketValueReader {
  return async (userId, walletAddress) => {
    const owner = `${SOLANA_OWNER}${walletAddress}`;
    if (!provider) {
      const enrollments = await store.completedEnrollments(userId, owner);
      if (enrollments.length > 0) throw new BasketValuationError("Glider is not configured.");
      return { totalUsd: ZERO, baskets: [], fetchedAt: null };
    }

    const [portfolios, catalog, mine] = await Promise.all([
      provider.portfoliosForOwner(owner),
      store.load(),
      custom?.mine(userId) ?? [],
    ]);
    if (portfolios.some((item) => item.ownerAccountId !== owner))
      throw new BasketValuationError("Glider returned a portfolio for another owner.");
    if (new Set(portfolios.map((item) => item.portfolioId)).size !== portfolios.length)
      throw new BasketValuationError("Glider returned duplicate portfolios.");
    if (portfolios.length === 0) return { totalUsd: ZERO, baskets: [], fetchedAt: null };

    /* Curated and this owner's own. Without the second half a basket somebody
       wrote is still counted — value comes from the portfolio, not from here —
       but shows as "Glider portfolio" with no slug to open it by. */
    const templates = new Map<
      string,
      { slug: string; name: string; assets: readonly { assetId: string; ticker: string }[] }
    >([
      ...catalog.filter((item) => item.providerId).map((item) => [item.providerId!, item] as const),
      ...mine.filter((item) => item.providerId).map((item) => [item.providerId!, item] as const),
    ]);
    const baskets = await Promise.all(
      portfolios.map(async (portfolio): Promise<ValuedBasket> => {
        const positions = await provider.positions(portfolio.portfolioId);
        if (positions.portfolioId !== portfolio.portfolioId || positions.warnings.length > 0)
          throw new BasketValuationError("Glider basket positions are incomplete.");
        const smartAccounts = new Set(portfolio.smartAccounts.map((item) => item.accountId));
        if (positions.assets.some((asset) => !smartAccounts.has(asset.smartAccountId)))
          throw new BasketValuationError("Glider returned an unowned smart-account asset.");

        const template = templates.get(portfolio.strategyId);
        return {
          portfolioId: portfolio.portfolioId,
          slug: template?.slug ?? null,
          name: template?.name ?? "Glider portfolio",
          valueUsd: toWire(money(positions.totalValueUsd)),
          inTransitUsd: toWire(money(positions.inTransitUsd)),
          fetchedAt: positions.fetchedAt,
          holdings: positions.assets.map((asset) => ({
            assetId: asset.assetId,
            symbol: asset.symbol,
            ticker: template?.assets.find((item) => item.assetId === asset.assetId)?.ticker ?? null,
            balance: asset.balance,
            valueUsd: toWire(money(asset.valueUsd)),
          })),
        };
      }),
    );

    return {
      totalUsd: baskets.reduce((total, basket) => total.add(D(basket.valueUsd)), ZERO),
      baskets,
      fetchedAt: new Date(Math.max(...baskets.map((basket) => Date.parse(basket.fetchedAt)))),
    };
  };
}
