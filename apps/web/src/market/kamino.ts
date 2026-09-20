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

/** Kamino's main pool, where the crypto collateral that backs the card sits. */
export const MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

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

export type Vault = {
  readonly symbol: string;
  readonly name: string;
  readonly logo: string;
  readonly maxLtv: number;
  readonly supplyApy: number;
};

/** The deposits shown on the card page, in the order the page lists them. */
const VAULTS: { symbol: string; name: string; logo: string }[] = [
  { symbol: "SOL", name: "Solana", logo: "/crypto/SOL.png" },
  { symbol: "USDT", name: "Tether", logo: "/crypto/USDT.svg" },
  { symbol: "ETH", name: "Ethereum", logo: "/crypto/ETH.png" },
  { symbol: "cbBTC", name: "Bitcoin", logo: "/crypto/cbBTC.png" },
  { symbol: "USDC", name: "USD Coin", logo: "/crypto/USDC.png" },
];

/**
 * Supply rates and collateral factors from Kamino's main pool. Rates move with
 * utilisation, so the page reads them rather than printing a number that was
 * true on the day it was written.
 */
export const fetchVaults = async (signal?: AbortSignal): Promise<Vault[]> => {
  const res = await fetch(`${BASE}/kamino-market/${MAIN_MARKET}/reserves/metrics`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Kamino main market returned ${res.status}`);
  const reserves = (await res.json()) as (Reserve & { totalSupplyUsd?: string })[];

  // The pool carries several reserves per asset; the deepest one is the real market.
  const deepest = new Map<string, Reserve & { totalSupplyUsd?: string }>();
  for (const r of reserves) {
    const cur = deepest.get(r.liquidityToken);
    if (!cur || Number(r.totalSupplyUsd ?? 0) > Number(cur.totalSupplyUsd ?? 0)) deepest.set(r.liquidityToken, r);
  }

  return VAULTS.flatMap(({ symbol, name, logo }) => {
    const r = deepest.get(symbol);
    return r ? [{ symbol, name, logo, maxLtv: Number(r.maxLtv), supplyApy: Number(r.supplyApy ?? 0) }] : [];
  });
};

export const fetchCreditMarket = async (signal?: AbortSignal): Promise<CreditMarket> => {
  const res = await fetch(`${BASE}/kamino-market/${XSTOCKS_MARKET}/reserves/metrics`, signal ? { signal } : {});
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
