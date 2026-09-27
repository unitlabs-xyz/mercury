/**
 * PLACEHOLDER METRICS — replace wholesale when the returns service exists.
 *
 * Everything in this file is invented. Nothing else in `src/market/` is: prices,
 * multipliers, routes, liquidity, holders, volume and net buyers are all live
 * reads. These are the figures no live endpoint gives us, because they need
 * price history we do not store yet:
 *
 *   - period returns and 5Y CAGR  → needs a historical price series
 *   - Harbor buyers in 30 days    → needs our own order table
 *
 * Values are derived from the ticker so they stay put across renders and
 * reloads; a random number that changed on every paint would look broken. When
 * the backend lands, delete this file and point `usePerformance` at it — the
 * call sites take the same shape.
 */

export type Performance = {
  readonly m1: number;
  readonly m6: number;
  readonly y1: number;
  readonly cagr5y: number;
  readonly harborBuyers30d: number;
};

/** Small deterministic hash, so "NVDA" always produces the same figures. */
const seed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10_000) / 10_000;
  };
};

/** Broad holdings get tighter, lower numbers than single stocks. */
const BROAD = new Set(["SPY", "QQQ", "GLD"]);

export const performanceFor = (ticker: string): Performance => {
  const rand = seed(ticker);
  const broad = BROAD.has(ticker);
  const spread = broad ? 1 : 2.6;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    m1: round((rand() * 9 - 3.2) * spread),
    m6: round((rand() * 22 - 6) * spread),
    y1: round((rand() * 38 - 9) * spread),
    cagr5y: round(broad ? 9 + rand() * 7 : 6 + rand() * 26),
    harborBuyers30d: Math.round(60 + rand() * (broad ? 3400 : 900)),
  };
};

/* ── price history ──────────────────────────────────────────────────── */

export type Range = "1D" | "1W" | "1M" | "1Y";
export const RANGES: readonly Range[] = ["1D", "1W", "1M", "1Y"];

/**
 * The move over a range. 1D is the live 24h change; the rest are placeholders,
 * and 1M and 1Y agree with `performanceFor` so a sparkline and the figure
 * beside it never disagree.
 */
export const changeFor = (ticker: string, range: Range, todayPct: number | null): number => {
  if (range === "1D") return todayPct ?? 0;
  const perf = performanceFor(ticker);
  if (range === "1M") return perf.m1;
  if (range === "1Y") return perf.y1;
  const rand = seed(`${ticker}:1W`);
  return Math.round((perf.m1 * 0.35 + (rand() - 0.45) * (BROAD.has(ticker) ? 2.4 : 6)) * 100) / 100;
};

const POINTS: Record<Range, number> = { "1D": 48, "1W": 42, "1M": 44, "1Y": 52 };

/**
 * A price path that ends at the live price and moves exactly `changeFor` over
 * the range: a seeded random walk with its drift removed, laid over a straight
 * line from the start price to the end. Same ticker, same shape, every render.
 */
export const historyFor = (
  ticker: string,
  range: Range,
  last: number | null,
  todayPct: number | null,
): number[] | null => {
  if (last === null || !Number.isFinite(last)) return null;
  const n = POINTS[range];
  const rand = seed(`${ticker}:${range}:path`);
  const vol = (BROAD.has(ticker) ? 0.0035 : 0.009) * (range === "1Y" ? 3.2 : range === "1D" ? 0.6 : 1.4);
  const raw = [0];
  for (let i = 1; i < n; i++) raw.push(raw[i - 1]! + (rand() - 0.5) * 2 * vol);
  // A short moving average takes the tick-to-tick jitter out, so the line reads as a trend.
  const walk = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const end = Math.log(1 + changeFor(ticker, range, todayPct) / 100);
  const drift = walk[n - 1]!;
  const start = last / Math.exp(end);
  return walk.map((w, i) => {
    const f = i / (n - 1);
    return start * Math.exp(w - drift * f + end * f);
  });
};

const SPAN_MS: Record<Range, number> = {
  "1D": 86_400_000,
  "1W": 7 * 86_400_000,
  "1M": 30 * 86_400_000,
  "1Y": 365 * 86_400_000,
};

/** When each of `n` points in a range was, evenly spaced and ending now. Tokens trade around the clock. */
export const timesFor = (range: Range, n: number, now = Date.now()): Date[] =>
  Array.from({ length: n }, (_, i) => new Date(now - SPAN_MS[range] * (1 - i / Math.max(1, n - 1))));
