import { D, type Decimal } from "@mercury/core";
import type { Collateral, CreditMarket, CreditSource } from "./ports.js";

/** Kamino's public API. No key, CORS-open — verified from the browser on 20 September 2026. */
const BASE = "https://api.kamino.finance";

/** The xStocks Market, not the primary pool. Stock collateral only exists here. */
export const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";

interface Reserve {
  readonly liquidityToken: string;
  readonly maxLtv?: string;
  readonly borrowApy?: string;
  readonly supplyApy?: string;
}

export interface KaminoCreditConfig {
  readonly baseUrl?: string;
  readonly marketAddress?: string;
  readonly fetch?: typeof fetch;
}

/** Rates arrive as decimal strings. They go straight into Decimal, never through a float. */
const rate = (v: string | undefined): Decimal | null => (v === undefined || v.length === 0 ? null : D(v));

export class KaminoCredit implements CreditSource {
  private readonly base: string;
  private readonly market: string;
  private readonly doFetch: typeof fetch;

  constructor(config: KaminoCreditConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.market = config.marketAddress ?? XSTOCKS_MARKET;
    this.doFetch = config.fetch ?? fetch;
  }

  async current(): Promise<CreditMarket> {
    const res = await this.doFetch(`${this.base}/kamino-market/${this.market}/reserves/metrics`);
    if (!res.ok) throw new Error(`kamino reserves returned ${res.status}`);
    const reserves = (await res.json()) as readonly Reserve[];

    const usdc = reserves.find((r) => r.liquidityToken === "USDC");

    const collateral: Collateral[] = reserves
      .filter((r) => /x$/.test(r.liquidityToken))
      .map((r) => ({
        symbol: r.liquidityToken,
        ticker: r.liquidityToken.replace(/x$/, ""),
        maxLtv: rate(r.maxLtv) ?? D(0),
      }))
      // A zero factor is Kamino saying this cannot be borrowed against. Listing
      // it as collateral with a limit of nothing would be an offer of nothing.
      .filter((c) => c.maxLtv.gt(0))
      .sort((a, b) => b.maxLtv.comparedTo(a.maxLtv));

    return {
      collateral,
      borrowApy: rate(usdc?.borrowApy),
      supplyApy: rate(usdc?.supplyApy),
    };
  }
}
