/**
 * Jupiter's free tier. No key, no account, CORS-open — verified from the browser
 * on 20 September 2026. The paid host (api.jup.ag) exists for higher rate limits
 * and takes a key; we deliberately do not use it, because a key shipped to a
 * browser is a public key.
 */
const BASE = "https://lite-api.jup.ag";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Jupiter ${path.split("?")[0]} returned ${res.status}`);
  return (await res.json()) as T;
};

export type JupToken = {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  isVerified?: boolean;
  tags?: string[];
  liquidity?: number;
  holderCount?: number;
};

/**
 * Search returns impersonators alongside the real thing — a "Nvidia Stonk" with
 * one holder sits next to the real NVDAx. Verification plus the issuer's own tag
 * is the filter that separates them; symbol alone is not enough to trade on.
 */
export const searchTokens = (query: string, signal?: AbortSignal) =>
  get<JupToken[]>(`/tokens/v2/search?query=${encodeURIComponent(query)}`, signal);

export type JupPrice = {
  usdPrice: number;
  decimals: number;
  liquidity?: number;
  priceChange24h?: number;
  blockId?: number;
  /** The underlying share, not the token. Independent of the pool. */
  stockData?: { price: number; updatedAt: string; mcap?: number };
  /** Token-2022 ScaledUiAmount. Absent for tokens that have never paid a dividend. */
  scaledUiConfig?: { multiplier?: number; newMultiplier?: number; newMultiplierEffectiveAt?: string };
};

/** All twenty wrappers fit in one request, so this is one call per refresh. */
export const fetchPrices = (mints: readonly string[], signal?: AbortSignal) =>
  mints.length === 0
    ? Promise.resolve({} as Record<string, JupPrice | null>)
    : get<Record<string, JupPrice | null>>(`/price/v3?ids=${mints.join(",")}`, signal);

export type JupQuote = {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan?: { swapInfo?: { label?: string } }[];
  contextSlot?: number;
};

/** A real routed quote for a real amount: what this order would actually fill at. */
export const fetchQuote = (
  outputMint: string,
  usd: number,
  signal?: AbortSignal,
  slippageBps = 50,
) => {
  const amount = Math.round(usd * 10 ** USDC_DECIMALS);
  return get<JupQuote>(
    `/swap/v1/quote?inputMint=${USDC_MINT}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`,
    signal,
  );
};
