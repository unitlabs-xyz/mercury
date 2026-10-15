/**
 * What traded, and what happened to the orders that did not.
 *
 * Two different questions, deliberately split. `byDay` is what actually
 * traded, so it reads filled orders only: a refused order is a quote nobody
 * filled, and its dollars never moved. `byStatus` is what happened to every
 * order, which is where a rising refusal rate shows up. Putting refused
 * dollars into volume would have made the seeded $999 refusal the largest
 * trading day in the series.
 *
 * Relies on `order_created_status_idx` — `(created_at, status)`. The table's
 * other indexes lead with `user_id` or `tx_signature`.
 *
 * Money is summed in SQL as `numeric` and returned as a decimal string; see
 * `money.ts`.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { instruments, orders } from "../db/schema.js";
import { decimal } from "./money.js";
import type { Reader } from "./timeout.js";
import type { Range } from "./range.js";

/** A hard cap, as on every query here. */
const MAX_ROWS = 1_200;

/** Enough to see where the volume is. */
const MAX_TICKERS = 25;

export interface OrderStats {
  readonly byDay: readonly {
    day: string;
    buys: number;
    sells: number;
    volumeUsd: string;
    /** Everything charged: the network cost and Mercury's fee together. */
    feesUsd: string;
    /** The part of it that was ours. See `order.mercury_fee_usd`. */
    revenueUsd: string;
    realisedPnlUsd: string;
  }[];
  readonly byStatus: readonly { status: string; count: number }[];
  readonly topTickers: readonly { ticker: string; count: number; volumeUsd: string }[];
}

export const orderStats = async (reader: Reader, range: Range): Promise<OrderStats> => {
  const inRange = and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to));
  const filled = and(inRange, eq(orders.status, "filled"));
  const dayOf = sql`date_trunc('day', ${orders.createdAt})`;

  const [byDay, byStatus, topTickers] = await Promise.all([
    reader
      .select({
        day: sql<string>`to_char(${dayOf}, 'YYYY-MM-DD')`,
        buys: sql<string>`count(*) filter (where ${orders.side} = 'buy')::text`,
        sells: sql<string>`count(*) filter (where ${orders.side} = 'sell')::text`,
        volumeUsd: sql<string>`coalesce(sum(${orders.usdAmount}), 0)::text`,
        feesUsd: sql<string>`coalesce(sum(${orders.feeUsd}), 0)::text`,
        revenueUsd: sql<string>`coalesce(sum(${orders.mercuryFeeUsd}), 0)::text`,
        realisedPnlUsd: sql<string>`coalesce(sum(${orders.realisedPnlUsd}), 0)::text`,
      })
      .from(orders)
      .where(filled)
      .groupBy(dayOf)
      .orderBy(asc(dayOf))
      .limit(MAX_ROWS),

    /* Every status, so a refusal rate is readable. */
    reader
      .select({ status: orders.status, count: sql<string>`count(*)::text` })
      .from(orders)
      .where(inRange)
      .groupBy(orders.status)
      .orderBy(asc(orders.status))
      .limit(MAX_ROWS),

    /* By money, not by count: AAPL has more orders than TSLA and less volume,
       and "busiest" on a trading dashboard means money. */
    reader
      .select({
        ticker: instruments.ticker,
        count: sql<string>`count(*)::text`,
        volumeUsd: sql<string>`coalesce(sum(${orders.usdAmount}), 0)::text`,
      })
      .from(orders)
      .innerJoin(instruments, eq(orders.instrumentId, instruments.id))
      .where(filled)
      .groupBy(instruments.ticker)
      .orderBy(sql`sum(${orders.usdAmount}) desc`)
      .limit(MAX_TICKERS),
  ]);

  return {
    byDay: byDay.map((r) => ({
      day: r.day,
      buys: Number(r.buys),
      sells: Number(r.sells),
      volumeUsd: decimal(r.volumeUsd),
      feesUsd: decimal(r.feesUsd),
      revenueUsd: decimal(r.revenueUsd),
      realisedPnlUsd: decimal(r.realisedPnlUsd),
    })),
    byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    topTickers: topTickers.map((r) => ({
      ticker: r.ticker,
      count: Number(r.count),
      volumeUsd: decimal(r.volumeUsd),
    })),
  };
};
