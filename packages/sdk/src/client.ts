import { z } from "zod";
import { ApiError, Decision, MarketStatus, ManagedBasketPortfolio, PreparedBasketEnrollment, SubmitBasketEnrollment } from "@mercury/types";

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
const BasketList = z.object({
  baskets: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      description: z.string(),
      feeBps: z.number(),
      minimumUsd: z.string(),
      capUsd: z.string().nullable(),
      venue: z.string(),
      constituents: z.array(z.object({ ticker: z.string(), weightBps: z.number() })),
    }),
  ),
});
const BasketPreview = z.object({
  legs: z.array(z.object({ ticker: z.string(), usdAmount: z.string(), decision: Decision.nullable() })),
  refusedLegs: z.array(z.string()),
  overall: z.enum(["executable", "partial", "refused"]),
});

/** A thin typed client. Every response is parsed, so nothing untyped reaches a component. */
export class MercuryClient {
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.doFetch = options.fetch ?? fetch;
  }

  private async call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.token !== undefined) headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.identityToken !== undefined) headers["x-privy-identity-token"] = this.options.identityToken;
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

  baskets = () => this.call("/v1/baskets", BasketList);
  previewBasket = (slug: string, usdAmount: string) =>
    this.call(`/v1/baskets/${slug}/preview`, BasketPreview, {
      method: "POST",
      body: JSON.stringify({ usdAmount, acceptQueued: false }),
    });

  basketEnrollment = (slug: string) =>
    this.call(`/v1/basket-templates/${encodeURIComponent(slug)}/enrollment`,
      z.object({ portfolio: ManagedBasketPortfolio.nullable() }));

  prepareBasketEnrollment = (slug: string) =>
    this.call(`/v1/basket-templates/${encodeURIComponent(slug)}/enrollment/prepare`,
      PreparedBasketEnrollment, { method: "POST" });

  submitBasketEnrollment = (slug: string, body: z.infer<typeof SubmitBasketEnrollment>) =>
    this.call(`/v1/basket-templates/${encodeURIComponent(slug)}/enrollment`,
      z.object({ portfolio: ManagedBasketPortfolio }),
      { method: "POST", body: JSON.stringify(SubmitBasketEnrollment.parse(body)) });
}
