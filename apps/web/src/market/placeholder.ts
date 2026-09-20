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
