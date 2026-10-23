/**
 * How often an account read refreshes, and how long its answer counts as fresh.
 *
 * Portfolio, Money and Activity share one policy on purpose. They used to hold
 * three: Money refreshed once a minute, the portfolio every thirty seconds, and
 * the activity feed had no interval at all — it updated on mount and on an
 * invalidation and otherwise never. Nothing chose that spread; it accumulated.
 *
 * Thirty seconds, from ten. Every poll of portfolio and money reads the chain
 * on the paid RPC, and the account menu in the top bar mounts both on every
 * page, so an open tab cost about thirteen calls every ten seconds and ran a
 * plan's month out (23 October 2026). What somebody does here themselves still
 * shows at once: `settle.ts` refreshes these after every transaction. Thirty
 * seconds is how late cash sent from outside may show, which is also how often
 * `wallet-events` looks for it.
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
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
} as const;
