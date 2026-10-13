import { z } from "zod";
import {
  Basket,
  PickableBasketAsset,
  ApiError,
  Decision,
  MarketStatus,
  BasketPortfolio,
  BasketPortfolioSnapshot,
  BasketPortfolioSummary,
  BasketOperation,
  TriggeredBasketRebalance,
  PreparedBasketEnrollment,
  SubmitBasketEnrollment,
  PrepareBasketFunding,
  PreparedBasketFunding,
  ConfirmBasketFunding,
  ConfirmedBasketFunding,
  BasketActivity,
} from "@mercury/types";

export class MercuryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MercuryError";
  }
}

export interface ClientOptions {
  readonly baseUrl: string;
  /** The connected Privy wallet. See ADR 0003: we never send a key, only an address. */
  readonly walletAddress?: string;
  readonly token?: string;
  /** Privy's signed wallet claim, required for owner-bound basket actions. */
  readonly identityToken?: string;
  readonly fetch?: typeof fetch;
}

const Instrument = z.object({
  ticker: z.string(),
  name: z.string(),
  sector: z.string().nullable(),
  pricePerShare: z.string().nullable(),
  wrappers: z.array(
    z.object({
      mint: z.string(),
      symbol: z.string(),
      issuer: z.enum(["backed", "ondo"]),
      multiplier: z.string(),
      decimals: z.number(),
      isRoutable: z.boolean(),
    }),
  ),
});

const InstrumentList = z.object({
  instruments: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      sector: z.string().nullable(),
      pricePerShare: z.string(),
      wrapperCount: z.number(),
    }),
  ),
});

const CreateOrder = z.object({ orderId: z.string(), decision: Decision });
const Unsigned = z.object({ transactions: z.array(z.string()), expiresAt: z.string() });

/** A thin typed client. Every response is parsed, so nothing untyped reaches a component. */
export class MercuryClient {
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.doFetch = options.fetch ?? fetch;
  }

  private async call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.token !== undefined) headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.identityToken !== undefined)
      headers["x-privy-identity-token"] = this.options.identityToken;
    if (this.options.walletAddress !== undefined) headers["x-wallet-address"] = this.options.walletAddress;

    const res = await this.doFetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const parsed = ApiError.safeParse(body);
      throw new MercuryError(
        parsed.success ? parsed.data.error.code : "internal",
        parsed.success ? parsed.data.error.message : `request failed with ${res.status}`,
        res.status,
      );
    }
    return schema.parse(body);
  }

  marketStatus = () => this.call("/v1/market/status", MarketStatus);
  instruments = (q?: string) =>
    this.call(`/v1/instruments${q ? `?q=${encodeURIComponent(q)}` : ""}`, InstrumentList);
  instrument = (ticker: string) => this.call(`/v1/instruments/${ticker}`, Instrument);

  /** Returns the decision. Nothing has happened on chain. Show it, then execute. */
  createOrder = (body: { ticker: string; side: "buy" | "sell"; amount: string }) =>
    this.call("/v1/orders", CreateOrder, { method: "POST", body: JSON.stringify(body) });

  executeOrder = (orderId: string) =>
    this.call(`/v1/orders/${orderId}/execute`, Unsigned, { method: "POST" });

  /** The curated shelf and the caller's own baskets, each marked `source`. */
  baskets = () => this.call("/v1/baskets", z.object({ baskets: Basket.array() }));

  basket = (slug: string) =>
    this.call(`/v1/baskets/${encodeURIComponent(slug)}`, z.object({ basket: Basket }));

  /** Whether this wallet has a portfolio here. Cheap; `basketPositions` is the full read. */
  basketPortfolio = (slug: string) =>
    this.call(
      `/v1/baskets/${encodeURIComponent(slug)}/portfolio`,
      z.object({ portfolio: BasketPortfolio.nullable() }),
    );

  basketPositions = (slug: string) =>
    this.call(
      `/v1/baskets/${encodeURIComponent(slug)}/portfolio/positions`,
      z.object({ portfolio: BasketPortfolioSnapshot.nullable() }),
    );

  basketAssets = () =>
    this.call("/v1/basket-assets", z.object({ assets: z.array(PickableBasketAsset) }));

  basketPortfolios = () =>
    this.call("/v1/basket-portfolios", z.object({ portfolios: BasketPortfolioSummary.array() }));

  basketOperation = (slug: string, operationId: string) =>
    this.call(
      `/v1/baskets/${encodeURIComponent(slug)}/operations/${encodeURIComponent(operationId)}`,
      z.object({ operation: BasketOperation }),
    );

  triggerBasketRebalance = (slug: string) =>
    this.call(`/v1/baskets/${encodeURIComponent(slug)}/rebalance`, TriggeredBasketRebalance, {
      method: "POST",
    });

  prepareBasketEnrollment = (slug: string) =>
    this.call(
      `/v1/baskets/${encodeURIComponent(slug)}/enrollment/prepare`,
      PreparedBasketEnrollment,
      { method: "POST" },
    );

  submitBasketEnrollment = (slug: string, body: z.infer<typeof SubmitBasketEnrollment>) =>
    this.call(
      `/v1/baskets/${encodeURIComponent(slug)}/enrollment/submit`,
      z.object({ portfolio: BasketPortfolio }),
      { method: "POST", body: JSON.stringify(SubmitBasketEnrollment.parse(body)) },
    );

  prepareBasketFunding = (slug: string, amountUsd: string) =>
    this.call(`/v1/baskets/${encodeURIComponent(slug)}/funding/prepare`, PreparedBasketFunding, {
      method: "POST",
      body: JSON.stringify(PrepareBasketFunding.parse({ amountUsd })),
    });

  confirmBasketFunding = (slug: string, signature: string) =>
    this.call(`/v1/baskets/${encodeURIComponent(slug)}/funding/confirm`, ConfirmedBasketFunding, {
      method: "POST",
      body: JSON.stringify(ConfirmBasketFunding.parse({ signature })),
    });

  basketActivity = (slug: string) =>
    this.call(
      `/v1/baskets/${encodeURIComponent(slug)}/activity`,
      z.object({ activity: BasketActivity.array() }),
    );
}
