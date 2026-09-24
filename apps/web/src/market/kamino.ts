/**
 * Kamino's public API. No key, CORS-open — verified from the browser on
 * 20 September 2026.
 *
 * Kamino runs a dedicated xStocks Market. We read it rather than describe it,
 * because collateral factors are a risk parameter Kamino changes when it wants
 * to, and a number typed into our source would quietly go stale.
 */
const BASE = "https://api.kamino.finance";

/** The xStocks Market, not the primary pool. Stock collateral only exists here. */
export const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";

type Reserve = {
  liquidityToken: string;
  maxLtv: string;
  borrowApy?: string;
  supplyApy?: string;
};

export type Collateral = {
  readonly symbol: string;
  readonly ticker: string;
  /** Share of the holding's value that can be borrowed against, as a ratio. */
  readonly maxLtv: number;
};

export type CreditMarket = {
  readonly collateral: readonly Collateral[];
  /** What borrowing a dollar costs per year right now. Floats with utilisation. */
  readonly borrowApy: number | null;
  readonly supplyApy: number | null;
};

export const fetchCreditMarket = async (signal?: AbortSignal): Promise<CreditMarket> => {
  const res = await fetch(
    `${BASE}/kamino-market/${XSTOCKS_MARKET}/reserves/metrics`,
    signal ? { signal } : {},
  );
  if (!res.ok) throw new Error(`Kamino reserves returned ${res.status}`);
  const reserves = (await res.json()) as Reserve[];

  const usdc = reserves.find((r) => r.liquidityToken === "USDC");
  const collateral = reserves
    .filter((r) => /x$/.test(r.liquidityToken) && Number(r.maxLtv) > 0)
    .map((r) => ({
      symbol: r.liquidityToken,
      ticker: r.liquidityToken.replace(/x$/, ""),
      maxLtv: Number(r.maxLtv),
    }))
    .sort((a, b) => b.maxLtv - a.maxLtv);

  return {
    collateral,
    borrowApy: usdc?.borrowApy ? Number(usdc.borrowApy) : null,
    supplyApy: usdc?.supplyApy ? Number(usdc.supplyApy) : null,
  };
};
