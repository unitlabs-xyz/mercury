import { D, type Decimal } from "@mercury/core";
import { defaultFetch } from "@mercury/chain";
import type { HistorySource, Series, SeriesPoint, Span } from "./ports.js";

/**
 * Yahoo's chart endpoint. No key, and no contract either.
 *
 * This is an unofficial endpoint: no SLA, no commercial terms, and it can
 * change without notice. It is here because the alternatives all cost a key or
 * do not serve equities — Pyth Benchmarks returns 403 for equity feeds on our
 * entitlement and has no range endpoint at all, measured 28 September 2026 —
 * and because the thing it replaces was invented numbers. Everything about the
 * shape of this file assumes it will be swapped: one adapter behind one port,
 * so Twelve Data or Finnhub is a file rather than a refactor.
 */
const BASE = "https://query1.finance.yahoo.com";

/**
 * Yahoo answers 429 to a request with no User-Agent, verified 28 September
 * 2026. This is not politeness, it is the difference between data and nothing.
 */
const USER_AGENT = "Mozilla/5.0";

/** How each span is asked for, and how long its answer stays fresh. */
const ASK: Record<Span, { readonly range: string; readonly interval: string; readonly ttlMs: number }> = {
  // Intraday spans move while someone is watching them, so they expire quickly.
  "1D": { range: "1d", interval: "5m", ttlMs: 60_000 },
  "1W": { range: "5d", interval: "15m", ttlMs: 60_000 },
  // A daily close does not change again once it is in. An hour is generous.
  "1M": { range: "1mo", interval: "1d", ttlMs: 3_600_000 },
  "6M": { range: "6mo", interval: "1d", ttlMs: 3_600_000 },
  "1Y": { range: "1y", interval: "1d", ttlMs: 3_600_000 },
  "5Y": { range: "5y", interval: "1wk", ttlMs: 3_600_000 },
};

interface Chart {
  readonly chart?: {
    readonly result?:
      | readonly {
          readonly timestamp?: readonly number[];
          readonly indicators?: {
            readonly quote?: readonly { readonly close?: readonly (number | null)[] }[];
          };
        }[]
      | null;
    readonly error?: unknown;
  };
}

export interface YahooHistoryConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

interface Entry {
  readonly at: number;
  readonly series: Series | null;
}

export class YahooHistory implements HistorySource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, Entry>();

  constructor(config: YahooHistoryConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? defaultFetch();
    this.now = config.now ?? Date.now;
  }

  /**
   * One span of one ticker's history, oldest point first.
   *
   * Null means the provider has nothing for this ticker — a delisted symbol, or
   * one it never carried. That is a missing chart and the caller should draw
   * none. A provider that is *failing* throws instead, so "we do not know this
   * company" and "Yahoo is down" never look the same to a caller.
   */
  async seriesFor(ticker: string, span: Span): Promise<Series | null> {
    const key = `${ticker}:${span}`;
    const ask = ASK[span];

    const hit = this.cache.get(key);
    if (hit !== undefined && this.now() - hit.at < ask.ttlMs) return hit.series;

    const url = `${this.base}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${ask.range}&interval=${ask.interval}`;
    const res = await this.doFetch(url, { headers: { "user-agent": USER_AGENT } });

    // 404 is Yahoo's answer for a symbol it does not carry, which is a fact
    // about the ticker and worth caching. Anything else is a fault at their
    // end, and caching a fault would keep a chart blank after it recovered.
    if (res.status === 404) return this.remember(key, null);
    if (!res.ok) throw new Error(`yahoo chart returned ${res.status}`);

    const body = (await res.json()) as Chart;
    const result = body.chart?.result?.[0];
    if (result === undefined || result === null) return this.remember(key, null);

    const times = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];

    const points: SeriesPoint[] = [];
    for (const [i, at] of times.entries()) {
      const close = closes[i];
      // Yahoo leaves nulls in a series for halted or untraded intervals. Read
      // as zero they would put a -100% cliff in the middle of a chart.
      if (close === null || close === undefined || !Number.isFinite(close)) continue;
      points.push({ at: new Date(at * 1000), price: D(close) });
    }

    // One point is a price, not a history: there is no move to measure across it.
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined || points.length < 2) return this.remember(key, null);

    return this.remember(key, {
      points,
      changePct: last.price.div(first.price).sub(1).mul(100),
    });
  }

  private remember(key: string, series: Series | null): Series | null {
    this.cache.set(key, { at: this.now(), series });
    return series;
  }
}

/**
 * The same shape, re-levelled so its last point is `price`.
 *
 * The series describes the underlying share; the number on the screen is what
 * the wrapper trades at, and the two sit a basis apart — -0.78% on NVDAx
 * against NVDA when this was measured. Anchoring moves the levels and leaves
 * every percentage untouched, so the chart still tells the truth about the move
 * and stops disagreeing with the price printed above it.
 */
export const anchoredTo = (series: Series, price: Decimal): Series => {
  const last = series.points[series.points.length - 1];
  if (last === undefined || last.price.isZero()) return series;
  const factor = price.div(last.price);
  return {
    changePct: series.changePct,
    points: series.points.map((p) => ({ at: p.at, price: p.price.mul(factor) })),
  };
};
