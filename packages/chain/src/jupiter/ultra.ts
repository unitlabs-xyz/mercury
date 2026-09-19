import { D, type Decimal } from "@harbor/core";
import type { QuoteRequest, QuoteSource } from "../ports.js";

const ULTRA = "https://lite-api.jup.ag/ultra/v1";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;

export interface JupiterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

const toBase = (amount: Decimal, decimals: number): string =>
  amount.mul(D(10).pow(decimals)).toDecimalPlaces(0, 1).toFixed();

const fromBase = (raw: string, decimals: number): Decimal => D(raw).div(D(10).pow(decimals));

/**
 * Jupiter Ultra. Chosen over the Router path in ADR 0008: composition was never
 * possible for a basket anyway, and Ultra takes over transaction landing.
 */
export class JupiterUltra implements QuoteSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly config: JupiterConfig) {
    this.base = config.baseUrl ?? ULTRA;
    this.doFetch = config.fetch ?? fetch;
  }

  async quote(req: QuoteRequest): Promise<ReturnType<QuoteSource["quote"]> extends Promise<infer T> ? T : never> {
    const buying = req.side === "buy";
    const inputMint = buying ? USDC_MINT : req.mint;
    const outputMint = buying ? req.mint : USDC_MINT;
    const inDecimals = buying ? USDC_DECIMALS : req.decimals;
    const outDecimals = buying ? req.decimals : USDC_DECIMALS;

    const url = new URL(`${this.base}/order`);
    url.searchParams.set("inputMint", inputMint);
    url.searchParams.set("outputMint", outputMint);
    url.searchParams.set("amount", toBase(req.amount, inDecimals));
    if (req.slippageBps !== undefined) url.searchParams.set("slippageBps", String(req.slippageBps));

    const res = await this.doFetch(url, { headers: { "x-api-key": this.config.apiKey } });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      outAmount?: string;
      priceImpactPct?: string;
      requestId?: string;
      routePlan?: { swapInfo?: { label?: string } }[];
    };
    if (body.outAmount === undefined || body.requestId === undefined) return null;

    const outAmount = fromBase(body.outAmount, outDecimals);
    if (outAmount.lte(0)) return null;

    return {
      inAmount: req.amount,
      outAmount,
      priceImpact: D(body.priceImpactPct ?? "0"),
      routeLabels: [...new Set((body.routePlan ?? []).map((r) => r.swapInfo?.label ?? "unknown"))],
      quoteId: body.requestId,
      expiresAt: new Date(Date.now() + 30_000),
    };
  }

  /**
   * Ultra returns a transaction that cannot be modified. We never need to modify one,
   * which is the whole argument in ADR 0008.
   */
  async buildSwap(quoteId: string, owner: string): Promise<readonly string[]> {
    const res = await this.doFetch(`${this.base}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.config.apiKey },
      body: JSON.stringify({ requestId: quoteId, taker: owner }),
    });
    if (!res.ok) throw new Error(`jupiter build failed: ${res.status}`);
    const body = (await res.json()) as { transaction?: string };
    if (body.transaction === undefined) throw new Error("jupiter returned no transaction");
    return [body.transaction];
  }
}

export { USDC_MINT, USDC_DECIMALS };
