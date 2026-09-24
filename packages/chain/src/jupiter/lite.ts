import { D, type Decimal } from "@mercury/core";
import type { Candidate } from "@mercury/core";
import type { QuoteRequest, QuoteSource } from "../ports.js";
import { USDC_DECIMALS, USDC_MINT } from "./ultra.js";
import { defaultFetch } from "../fetch.js";

const LITE = "https://lite-api.jup.ag";

/**
 * A quote is a live price, not an offer. Twenty seconds is the window the browser
 * has used since 20 September 2026; Ultra's own orders last thirty.
 */
const QUOTE_TTL_MS = 20_000;

const toBase = (amount: Decimal, decimals: number): string =>
  amount.mul(D(10).pow(decimals)).toDecimalPlaces(0, 1).toFixed();

const fromBase = (raw: string, decimals: number): Decimal => D(raw).div(D(10).pow(decimals));

interface JupQuote {
  readonly inAmount?: string;
  readonly outAmount?: string;
  readonly priceImpactPct?: string;
  readonly routePlan?: readonly { readonly swapInfo?: { readonly label?: string } }[];
  readonly contextSlot?: number;
}

export interface JupiterLiteConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly slippageBps?: number;
}

/**
 * Jupiter's keyless `/swap/v1/quote`. This is the *pricing* half of the pair the
 * backend design calls for: a real routed quote for the real amount, which is
 * what the order would actually fill at. The *executing* half is `JupiterUltra`,
 * which takes a key and arrives with subsystem 3. Both satisfy `QuoteSource`, so
 * `priceOrder` never learns which one it has.
 */
export class JupiterLite implements QuoteSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly slippageBps: number;

  constructor(config: JupiterLiteConfig = {}) {
    this.base = config.baseUrl ?? LITE;
    this.doFetch = config.fetch ?? defaultFetch();
    this.slippageBps = config.slippageBps ?? 50;
  }

  async quote(req: QuoteRequest): Promise<Candidate["quote"]> {
    const buying = req.side === "buy";
    const inputMint = buying ? USDC_MINT : req.mint;
    const outputMint = buying ? req.mint : USDC_MINT;
    const inDecimals = buying ? USDC_DECIMALS : req.decimals;
    const outDecimals = buying ? req.decimals : USDC_DECIMALS;

    const url = new URL(`${this.base}/swap/v1/quote`);
    url.searchParams.set("inputMint", inputMint);
    url.searchParams.set("outputMint", outputMint);
    url.searchParams.set("amount", toBase(req.amount, inDecimals));
    url.searchParams.set("slippageBps", String(req.slippageBps ?? this.slippageBps));

    // A 4xx here is Jupiter saying there is no route at this size, which is a
    // real answer and becomes a candidate with a null quote — not a dropped row.
    const res = await this.doFetch(url);
    if (!res.ok) return null;

    const body = (await res.json()) as JupQuote;
    if (body.outAmount === undefined) return null;

    const outAmount = fromBase(body.outAmount, outDecimals);
    if (outAmount.lte(0)) return null;

    return {
      inAmount: body.inAmount === undefined ? req.amount : fromBase(body.inAmount, inDecimals),
      outAmount,
      // Straight from the string. Going through a JS number would round a
      // number that decides whether an order is allowed to fill.
      priceImpact: D(body.priceImpactPct ?? "0").abs(),
      routeLabels: [...new Set((body.routePlan ?? []).map((r) => r.swapInfo?.label ?? "unknown"))],
      // Lite has no request id. The slot makes it unique enough to tell two
      // quotes apart; nothing redeems it, because execution re-quotes on Ultra.
      quoteId: `${req.mint}:${body.contextSlot ?? 0}`,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    };
  }

  buildSwap(_quoteId: string, _owner: string): Promise<readonly string[]> {
    return Promise.reject(
      new Error(
        "JupiterLite.buildSwap: the keyless endpoint prices orders, it does not build them. Execution uses JupiterUltra — subsystem 3.",
      ),
    );
  }
}
