import { D, type Decimal } from "@mercury/core";
import type { Candidate } from "@mercury/core";
import type { QuoteRequest, QuoteSource, RedeemableQuote } from "../ports.js";
import { USDC_DECIMALS, USDC_MINT } from "../usdc.js";
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
  /** The floor the route will not fill below, already net of `slippageBps`. */
  readonly otherAmountThreshold?: string;
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
 * Jupiter's keyless `/swap/v1/quote` and `/swap/v1/swap`: a real routed quote
 * for the real amount, and the transaction that fills that same quote.
 *
 * This used to be the pricing half of a pair whose executing half was
 * `JupiterUltra`, behind an API key. That split meant the quote a user was
 * shown and the quote they filled at came from two different systems, and
 * nothing compared them — the premium check ran on a number that never
 * executed. Probing the keyless endpoint on 29 September 2026 showed it builds
 * a signable v0 transaction from the verbatim quote payload, with the token
 * account creation folded in and no key required, so the split had nothing left
 * to buy. One quote is now priced, checked and filled.
 */
export class JupiterLite implements QuoteSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly slippageBps: number;

  constructor(config: JupiterLiteConfig = {}) {
    this.base = config.baseUrl ?? LITE;
    this.doFetch = config.fetch ?? defaultFetch();
    // A fallback only. Order pricing passes the policy's value on every call;
    // this covers a caller that has no policy to hand.
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
      // Jupiter's own floor rather than `outAmount` scaled by the slippage we
      // asked for: the route enforces this number, so it is the one a promise
      // can be made against. Absent, the floor is the expectation — which is
      // the honest reading of a quote that declines to name one.
      minOutAmount:
        body.otherAmountThreshold === undefined
          ? outAmount
          : fromBase(body.otherAmountThreshold, outDecimals),
      // Straight from the string. Going through a JS number would round a
      // number that decides whether an order is allowed to fill.
      priceImpact: D(body.priceImpactPct ?? "0").abs(),
      routeLabels: [...new Set((body.routePlan ?? []).map((r) => r.swapInfo?.label ?? "unknown"))],
      // The slot tells two quotes of the same mint apart. It identifies a quote;
      // `raw` is what redeems one.
      quoteId: `${req.mint}:${body.contextSlot ?? 0}`,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      raw: body,
    };
  }

  /**
   * The transaction that fills exactly the quote passed in. `raw` goes back
   * unread and unmodified — Jupiter prices the route it already chose, so
   * nothing between the check and the fill can re-route the order.
   */
  async buildSwap(quote: RedeemableQuote, owner: string): Promise<readonly string[]> {
    if (quote.raw === null || quote.raw === undefined) {
      throw new Error("JupiterLite.buildSwap: the quote carries no payload to redeem.");
    }

    const res = await this.doFetch(`${this.base}/swap/v1/swap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote.raw,
        userPublicKey: owner,
        // The buyer may not hold the token yet. Jupiter folds the account
        // creation into the same transaction, so a first purchase is one signature.
        wrapAndUnwrapSol: true,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`jupiter build failed: ${res.status} ${detail.slice(0, 200)}`);
    }

    const body = (await res.json()) as { swapTransaction?: string; simulationError?: unknown };
    if (body.swapTransaction === undefined) throw new Error("jupiter returned no transaction");
    // Jupiter simulates before it answers. A failure here is the route telling
    // us this will not land, which is cheaper to learn now than after a signature.
    if (body.simulationError !== null && body.simulationError !== undefined) {
      throw new Error(`jupiter simulation failed: ${JSON.stringify(body.simulationError).slice(0, 200)}`);
    }
    return [body.swapTransaction];
  }
}
