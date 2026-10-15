/**
 * Where the money comes from, and what happens to it on the way.
 *
 * The question this whole surface was asked for: which chains deposits arrive
 * from, whether that is changing, how long they take, and why they fail.
 * `funding_intent` can answer it only because it stores `origin_chain_name` as
 * it was named to the user — `wallet-events` sees USDC arrive and can never
 * say what it arrived from, so without this row a deposit bridged from Tron
 * and a transfer from a friend are the same two lines in the database.
 *
 * Relies on `funding_intent_created_chain_idx` — `(created_at,
 * origin_chain_name, status)`. The table's other index leads with `user_id`,
 * which cannot serve a query that does not filter on one.
 *
 * Everything computed is cast to `text` in SQL and converted here. A raw SQL
 * expression in a select carries no drizzle column mapper, and the two drivers
 * disagree about what they hand back for dates and numerics — `text` is text
 * on both. See `freshness.ts` for the measurements.
 */
import { and, asc, gte, lt, sql } from "drizzle-orm";
import { fundingIntents } from "../db/schema.js";
import type { Reader } from "./timeout.js";
import type { Range } from "./range.js";

/** A hard cap on every row set, as every query here has. */
const MAX_ROWS = 2_000;

/** Enough to act on. A long tail of one-offs is not a failure mode. */
const MAX_REASONS = 20;

export interface FundingStats {
  /** One row per chain, day and status: the trend, at the grain it is drawn at. */
  readonly byChain: readonly { chain: string; day: string; status: string; count: number }[];
  /** Median seconds from quote to settlement, per chain. Settled deposits only. */
  readonly settleSeconds: readonly { chain: string; p50: number }[];
  readonly failures: readonly { reason: string; count: number }[];
}

const day = sql<string>`to_char(date_trunc('day', ${fundingIntents.createdAt}), 'YYYY-MM-DD')`;

export const fundingStats = async (reader: Reader, range: Range): Promise<FundingStats> => {
  const inRange = and(gte(fundingIntents.createdAt, range.from), lt(fundingIntents.createdAt, range.to));

  const byChain = await reader
    .select({
      chain: fundingIntents.originChainName,
      day,
      status: fundingIntents.status,
      count: sql<string>`count(*)::text`,
    })
    .from(fundingIntents)
    .where(inRange)
    .groupBy(
      fundingIntents.originChainName,
      sql`date_trunc('day', ${fundingIntents.createdAt})`,
      fundingIntents.status,
    )
    .orderBy(asc(sql`date_trunc('day', ${fundingIntents.createdAt})`), asc(fundingIntents.originChainName))
    .limit(MAX_ROWS);

  /*
   * Settled only. The failed Base deposit in the fixtures took five minutes to
   * give up; counting it would report Base's settle time as two and a half
   * minutes, under a heading that says settled.
   */
  const settleSeconds = await reader
    .select({
      chain: fundingIntents.originChainName,
      p50: sql<string>`percentile_cont(0.5) within group (
        order by extract(epoch from (${fundingIntents.updatedAt} - ${fundingIntents.createdAt}))
      )::text`,
    })
    .from(fundingIntents)
    .where(and(inRange, sql`${fundingIntents.status} = 'settled'`))
    .groupBy(fundingIntents.originChainName)
    .orderBy(asc(fundingIntents.originChainName))
    .limit(MAX_ROWS);

  const failures = await reader
    .select({ reason: fundingIntents.failReason, count: sql<string>`count(*)::text` })
    .from(fundingIntents)
    .where(and(inRange, sql`${fundingIntents.failReason} is not null`))
    .groupBy(fundingIntents.failReason)
    .orderBy(sql`count(*) desc`)
    .limit(MAX_REASONS);

  return {
    byChain: byChain.map((r) => ({
      chain: r.chain,
      day: r.day,
      status: r.status,
      count: Number(r.count),
    })),
    settleSeconds: settleSeconds.map((r) => ({ chain: r.chain, p50: Number(r.p50) })),
    failures: failures.map((r) => ({ reason: r.reason ?? "unknown", count: Number(r.count) })),
  };
};
