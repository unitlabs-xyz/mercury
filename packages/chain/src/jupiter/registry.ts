import { D, ZERO, type Decimal, type Issuer } from "@mercury/core";
import type {
  CatalogueInstrument,
  CatalogueSource,
  CatalogueWrapper,
  TokenRef,
  TokenRegistry,
} from "../ports.js";

/**
 * Jupiter's free tier. No key, no account, CORS-open. The paid host (api.jup.ag)
 * exists for higher rate limits and takes a key; we deliberately do not use it,
 * because a key that also ships to a browser is a public key.
 */
const BASE = "https://lite-api.jup.ag";

/** The token universe changes when an issuer lists something. Hours, not seconds. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Roughly the pool depth a $1,000 order needs to stay inside the policy's 1.5%
 * impact cap. An instrument where no wrapper clears this cannot be filled at a
 * normal size, so listing it would be an offer we cannot honour.
 *
 * Measured 20 September 2026: every verified Backed wrapper sits above it
 * ($80k-$6.6m) and every Ondo one below ($80-$48k). Wrappers are never dropped
 * individually, only whole instruments, so the issuer comparison keeps both legs
 * wherever both exist.
 */
export const MIN_LIQUIDITY_USD = D(70_000);

const ISSUER_TAG: Record<Issuer, string> = { backed: "xstocks", ondo: "ondo" };

interface JupStats {
  readonly buyVolume?: number;
  readonly sellVolume?: number;
  readonly numTraders?: number;
  readonly numNetBuyers?: number;
}

interface JupToken {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly icon?: string;
  readonly decimals: number;
  readonly isVerified?: boolean | null;
  readonly tags?: readonly string[];
  readonly liquidity?: number;
  readonly holderCount?: number;
  readonly stats24h?: JupStats;
}

export interface JupiterRegistryConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

/** "NVDAx" -> "NVDA", "NVDAon" -> "NVDA", "BRK.Bx" -> "BRK.B". */
const tickerOf = (symbol: string, issuer: Issuer): string =>
  issuer === "backed" ? symbol.replace(/x$/, "") : symbol.replace(/on$/, "");

/**
 * Only verified tokens carrying the issuer's own tag. Search returns
 * impersonators next to the real thing — an "NVDAon" with 17 holders, an "NVDAx"
 * with one — and a symbol match alone would route a customer's money into one.
 */
const keep = (t: JupToken, issuer: Issuer): boolean =>
  t.isVerified === true && (t.tags ?? []).includes(ISSUER_TAG[issuer]);

/** Coerced through Decimal, because a field Jupiter stops sending must not become NaN. */
const num = (v: number | undefined): Decimal => (typeof v === "number" && Number.isFinite(v) ? D(v) : ZERO);

const toWrapper = (t: JupToken, issuer: Issuer): CatalogueWrapper => ({
  mint: t.id,
  symbol: t.symbol,
  issuer,
  decimals: t.decimals,
  name: t.name,
  icon: t.icon ?? null,
  liquidityUsd: num(t.liquidity),
  holders: Math.max(0, Math.round(t.holderCount ?? 0)),
  netBuyers24h: Math.max(0, Math.round(t.stats24h?.numNetBuyers ?? 0)),
  volume24hUsd: num(t.stats24h?.buyVolume).add(num(t.stats24h?.sellVolume)),
  traders24h: Math.max(0, Math.round(t.stats24h?.numTraders ?? 0)),
});

const toRef = (w: CatalogueWrapper, ticker: string): TokenRef => ({
  mint: w.mint,
  symbol: w.symbol,
  ticker,
  issuer: w.issuer,
  decimals: w.decimals,
});

export class JupiterRegistry implements TokenRegistry, CatalogueSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private cache: { at: number; value: readonly CatalogueInstrument[] } | null = null;

  constructor(config: JupiterRegistryConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? fetch;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  private async search(query: string): Promise<readonly JupToken[]> {
    const res = await this.doFetch(`${this.base}/tokens/v2/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`jupiter search ${query} returned ${res.status}`);
    return (await res.json()) as readonly JupToken[];
  }

  async instruments(): Promise<readonly CatalogueInstrument[]> {
    const cached = this.cache;
    if (cached !== null && this.now() - cached.at < this.ttlMs) return cached.value;

    // Ondo is allowed to fail: it is the second leg of a comparison, not the
    // shelf. xStocks failing leaves nothing to show, so it throws.
    const [xs, on] = await Promise.all([
      this.search("xStock"),
      this.search("Ondo Tokenized").catch(() => [] as readonly JupToken[]),
    ]);

    const byTicker = new Map<string, CatalogueWrapper[]>();
    const add = (tokens: readonly JupToken[], issuer: Issuer) => {
      for (const t of tokens) {
        if (!keep(t, issuer)) continue;
        const ticker = tickerOf(t.symbol, issuer);
        const list = byTicker.get(ticker) ?? [];
        if (list.some((w) => w.issuer === issuer)) continue; // first verified wins
        list.push(toWrapper(t, issuer));
        byTicker.set(ticker, list);
      }
    };
    add(xs, "backed");
    add(on, "ondo");

    const value = [...byTicker.entries()]
      .filter(([, wrappers]) => wrappers.some((w) => w.liquidityUsd.gte(MIN_LIQUIDITY_USD)))
      .map(([ticker, wrappers]) => ({ ticker, wrappers: wrappers as readonly CatalogueWrapper[] }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

    this.cache = { at: this.now(), value };
    return value;
  }

  async wrappersFor(ticker: string): Promise<readonly TokenRef[]> {
    const found = (await this.instruments()).find((i) => i.ticker === ticker);
    return found === undefined ? [] : found.wrappers.map((w) => toRef(w, found.ticker));
  }

  async all(): Promise<readonly TokenRef[]> {
    return (await this.instruments()).flatMap((i) => i.wrappers.map((w) => toRef(w, i.ticker)));
  }

  async byMint(mint: string): Promise<TokenRef | null> {
    return (await this.all()).find((t) => t.mint === mint) ?? null;
  }
}
