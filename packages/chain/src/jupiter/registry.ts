import { D, ZERO, type Decimal, type Issuer } from "@mercury/core";
import type { ListedInstrument, SupportedStocks, ListedWrapper, TokenRef, TokenRegistry } from "../ports.js";
import { defaultFetch } from "../fetch.js";

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
 * impact cap. It no longer decides what is listed — every verified wrapper is —
 * only what is *featured*: the short list a new visitor sees before searching.
 *
 * Measured 20 September 2026: every verified Backed wrapper on the old shelf sat
 * above it ($80k-$6.6m) and every Ondo one below ($80-$48k).
 */
export const FEATURED_LIQUIDITY_USD = D(70_000);

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
  /** Absent when Jupiter has no market for the token at all. */
  readonly usdPrice?: number | null;
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

const toWrapper = (t: JupToken, issuer: Issuer): ListedWrapper => ({
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
  hasMarket: typeof t.usdPrice === "number" && t.usdPrice > 0,
});

const toRef = (w: ListedWrapper, ticker: string): TokenRef => ({
  mint: w.mint,
  symbol: w.symbol,
  ticker,
  issuer: w.issuer,
  decimals: w.decimals,
});

export class JupiterRegistry implements TokenRegistry, SupportedStocks {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private cache: { at: number; value: readonly ListedInstrument[] } | null = null;

  constructor(config: JupiterRegistryConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? defaultFetch();
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  /**
   * Every verified token in one call, then split by issuer tag. Search answers at
   * most twenty results a query, which is what capped the old shelf at nineteen.
   * If the full list is unavailable, the two searches still give the head of it.
   */
  private async universe(): Promise<readonly [readonly JupToken[], readonly JupToken[]]> {
    try {
      const res = await this.doFetch(`${this.base}/tokens/v2/tag?query=verified`);
      if (!res.ok) throw new Error(`jupiter tag verified returned ${res.status}`);
      const all = (await res.json()) as readonly JupToken[];
      if (!Array.isArray(all) || all.length === 0) throw new Error("jupiter tag verified was empty");
      const tagged = (issuer: Issuer) => all.filter((t) => (t.tags ?? []).includes(ISSUER_TAG[issuer]));
      return [tagged("backed"), tagged("ondo")];
    } catch {
      // Ondo is allowed to fail: it is the second leg of a comparison, not the
      // shelf. xStocks failing leaves nothing to show, so it throws.
      return Promise.all([
        this.search("xStock"),
        this.search("Ondo Tokenized").catch(() => [] as readonly JupToken[]),
      ]);
    }
  }

  private async search(query: string): Promise<readonly JupToken[]> {
    const res = await this.doFetch(`${this.base}/tokens/v2/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`jupiter search ${query} returned ${res.status}`);
    return (await res.json()) as readonly JupToken[];
  }

  async instruments(): Promise<readonly ListedInstrument[]> {
    const cached = this.cache;
    if (cached !== null && this.now() - cached.at < this.ttlMs) return cached.value;

    const [xs, on] = await this.universe();
    const byTicker = new Map<string, ListedWrapper[]>();
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

    // Everything verified is listed, however thin. Whether a thin one can fill an
    // order is the decision engine's call at the amount asked, not the shelf's.
    const value = [...byTicker.entries()]
      .map(([ticker, wrappers]) => ({ ticker, wrappers: wrappers as readonly ListedWrapper[] }))
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
