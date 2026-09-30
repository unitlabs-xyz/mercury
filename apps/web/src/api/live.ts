/**
 * How often an account read refreshes, and how long its answer counts as fresh.
 *
 * Portfolio, Money and Activity share one policy on purpose. They used to hold
 * three: Money refreshed once a minute, the portfolio every thirty seconds, and
 * the activity feed had no interval at all — it updated on mount and on an
 * invalidation and otherwise never. Nothing chose that spread; it accumulated.
 *
 * The server was never the slow part. `position-sync` runs every two seconds
 * and `wallet-events` every thirty, so the staleness was entirely in the
 * browser.
 *
 * One number for the interval and the stale window, because a `staleTime` above
 * the interval would serve a cached answer to a page that had just remounted
 * while the timer refetched underneath it — two policies disagreeing about the
 * same data.
 *
 * `refetchOnWindowFocus` is off globally in `App.tsx`, where it was turned off
 * for market data. These reads opt back in: the thing somebody does between
 * looking at this page and looking at it again is approve a transaction in a
 * wallet popup, which is exactly when their balances stop being true.
 *
 * `refetchIntervalInBackground` is deliberately absent, so polling stops in a
 * background tab. `/v1/portfolio` and `/v1/money` each read the chain, and the
 * portfolio also asks Jupiter for prices, so a forgotten tab would spend an RPC
 * quota all day on nobody.
 */
export const LIVE = {
  staleTime: 10_000,
  refetchInterval: 10_000,
  refetchOnWindowFocus: true,
} as const;
