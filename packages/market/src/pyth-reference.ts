import { D, ZERO, type ReferencePrice } from "@mercury/core";
import { defaultFetch } from "@mercury/chain";
import type { ReferenceSource } from "./ports.js";

/**
 * The reference price from Pyth, which publishes continuously.
 *
 * The issuer's quote inside Jupiter's `price/v3` republishes every 155 seconds
 * at the median and 221 at worst, measured 9 October 2026 — so the price every
 * order is checked against is routinely minutes behind the market it describes.
 * Pyth publishes sub-second while the exchange is open, which is what makes the
 * one percent premium tolerance mean one percent rather than one percent plus
 * however far the market moved since the last republish.
 *
 * It does not replace `staleWidening`. Pyth's equity feeds close with the
 * exchange exactly as the issuer's do: at 2am there is no fresh share price
 * anywhere, and nothing here can invent one.
 *
 * Hermes needs an API key as of 26 August 2026 — the price endpoints answer
 * `401 unauthorized` without one, verified from the server on 9 October 2026.
 * The older note in `pyth.ts` says CORS is what rules this out; that stopped
 * being the obstacle when pricing moved to the server, and authentication took
 * its place. Only the metadata endpoint below is still keyless.
 */
const BASE = "https://hermes.pyth.network";

interface FeedMeta {
  readonly id: string;
  readonly attributes?: {
    readonly display_symbol?: string;
    readonly symbol?: string;
    readonly asset_type?: string;
  };
}

interface Parsed {
  readonly id: string;
  readonly price?: {
    readonly price: string;
    readonly expo: number;
    readonly publish_time: number;
  };
}

export interface PythReferenceConfig {
  /** Hermes rejects the price endpoints without one. */
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

/**
 * `Equity.US.NVDA/USD` is how Pyth names a US equity; the display symbol is
 * just `NVDA`. Either is read, because the display symbol is the one that
 * matches a ticker and the full symbol is the one that is always present.
 */
const tickerOf = (meta: FeedMeta): string | null => {
  const display = meta.attributes?.display_symbol;
  if (display !== undefined && display !== "") return display.toUpperCase();
  const symbol = meta.attributes?.symbol;
  if (symbol === undefined) return null;
  const base = symbol.split("/")[0];
  const last = base?.split(".").pop();
  return last === undefined || last === "" ? null : last.toUpperCase();
};

export class PythReference implements ReferenceSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly apiKey: string;
  /**
   * Ticker to feed id, read once.
   *
   * The promise is cached rather than the map, so the several reads that arrive
   * while the first is in flight share it instead of each fetching 1,252 feeds.
   * Cleared on failure so a transient one is not remembered for ever.
   */
  private feeds: Promise<ReadonlyMap<string, string>> | null = null;

  constructor(config: PythReferenceConfig) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? defaultFetch();
    this.apiKey = config.apiKey;
  }

  private feedIds(): Promise<ReadonlyMap<string, string>> {
    if (this.feeds !== null) return this.feeds;
    const pending = (async () => {
      // Keyless, and the same endpoint `PythSessions` already reads.
      const res = await this.doFetch(`${this.base}/v2/price_feeds?asset_type=equity`);
      if (!res.ok) throw new Error(`pyth price_feeds returned ${res.status}`);
      const feeds = (await res.json()) as readonly FeedMeta[];
      const byTicker = new Map<string, string>();
      for (const meta of feeds) {
        const ticker = tickerOf(meta);
        // First wins: duplicates are the same equity under two spellings, and
        // the list is ordered with the canonical one first.
        if (ticker !== null && !byTicker.has(ticker)) byTicker.set(ticker, meta.id);
      }
      return byTicker;
    })();
    this.feeds = pending;
    pending.catch(() => {
      if (this.feeds === pending) this.feeds = null;
    });
    return pending;
  }

  /**
   * Null rather than throwing, for every failure: no feed for this ticker, no
   * key, a dead upstream.
   *
   * Null is what hands the question to the source behind this one. Throwing
   * would take the whole decision down, and `priceOrder` turns a missing
   * reference into "Unknown instrument" — one expired key would make every
   * stock read as nonexistent, including to somebody trying to sell.
   */
  async priceFor(ticker: string): Promise<ReferencePrice | null> {
    let id: string | undefined;
    try {
      id = (await this.feedIds()).get(ticker.toUpperCase());
    } catch (error) {
      console.error("pyth: could not read the equity feed list", error);
      return null;
    }
    if (id === undefined) return null;

    try {
      const url = `${this.base}/v2/updates/price/latest?ids%5B%5D=${id}&parsed=true`;
      const res = await this.doFetch(url, { headers: { authorization: `Bearer ${this.apiKey}` } });
      if (!res.ok) {
        console.error(`pyth: price for ${ticker} returned ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { readonly parsed?: readonly Parsed[] };
      const price = body.parsed?.find((p) => p.id === id)?.price ?? body.parsed?.[0]?.price;
      if (price === undefined) return null;

      // Pyth publishes an integer and an exponent; the exponent is negative.
      const perShare = D(price.price).mul(D(10).pow(price.expo));
      if (!perShare.isFinite() || perShare.lte(ZERO)) return null;

      return {
        pricePerShare: perShare,
        observedAt: new Date(price.publish_time * 1000),
        // As with the issuer's quote: no upstream we read publishes one.
        pendingDividendNet: ZERO,
      };
    } catch (error) {
      console.error(`pyth: could not read a price for ${ticker}`, error);
      return null;
    }
  }
}

/**
 * The first source that has an answer.
 *
 * Pyth covers 820 of the 1,506 tagged tickers — every one of the featured set,
 * and the misses are almost all European listings — so something has to answer
 * for the rest. The same fallback is what keeps the product up when Pyth is
 * rate-limited, its key expires, or Hermes is down: the answer degrades to a
 * reference a few minutes old, which `staleWidening` already knows how to
 * price against, instead of every stock vanishing.
 */
export class FallbackReference implements ReferenceSource {
  constructor(
    private readonly primary: ReferenceSource,
    private readonly backup: ReferenceSource,
  ) {}

  async priceFor(ticker: string): Promise<ReferencePrice | null> {
    try {
      const first = await this.primary.priceFor(ticker);
      if (first !== null) return first;
    } catch (error) {
      console.error(`reference: the primary source failed for ${ticker}`, error);
    }
    return this.backup.priceFor(ticker);
  }
}
