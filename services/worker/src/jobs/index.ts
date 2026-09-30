export interface Job {
  readonly name: string;
  /** Milliseconds. Price cache runs faster while the market is open. */
  readonly everyMs: number;
  run(): Promise<void>;
}

/**
 * The scheduled half of the system. See docs/03.
 *
 * | Job              | Cadence               | Does                                             |
 * | ---------------- | --------------------- | ------------------------------------------------ |
 * | price-cache      | 15s open, 60s closed  | Reference prices, session state, multipliers      |
 * | multiplier-watch | 5 min                 | Detects dividends and writes an event per holder  |
 * | queued-orders    | 60s                   | Polls Jupiter trigger orders, records fills       |
 * | position-sync    | 5 min                 | LIVE, but in services/api: an interval in index.ts |
 * |                  |                       | It needs the database, which this package cannot   |
 * |                  |                       | reach.                                              |
 */
export const JOB_PLAN = [
  { name: "price-cache", everyMs: 15_000 },
  { name: "multiplier-watch", everyMs: 300_000 },
  { name: "queued-orders", everyMs: 60_000 },
  { name: "position-sync", everyMs: 300_000 },
] as const;
