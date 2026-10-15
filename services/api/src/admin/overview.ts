/**
 * Who is here, and what they hold.
 *
 * The range governs the one series on this panel — new users by day. The rest
 * is deliberately lifetime: "how many of our users have ever got money in" is
 * the conversion figure, and scoping it to the last thirty days would report
 * every user who funded in month one as unfunded. A panel where some figures
 * are lifetime and one is a range is worth the oddity; a conversion rate that
 * silently means something else is not.
 *
 * Relies on `portfolio_snapshot`'s primary key — `(user_id, captured_at)` —
 * for the latest reading per user, which is the one admin query the existing
 * indexes already serve.
 *
 * Money is summed in SQL as `numeric` and returned as a decimal string. See
 * `money.ts`: a float cannot hold a cent, and this is the figure somebody
 * quotes.
 */
import { asc, desc, sql } from "drizzle-orm";
import { fundingIntents, orders, portfolioSnapshots, users, wallets } from "../db/schema.js";
import { decimal } from "./money.js";
import type { Reader } from "./timeout.js";
import type { Range } from "./range.js";

/** A hard cap, as on every query here. A day per row: three years of them. */
const MAX_ROWS = 1_200;

export interface Overview {
  readonly users: number;
  readonly newUsers: readonly { day: string; count: number }[];
  readonly walletsByKind: readonly { kind: string; count: number }[];
  /** Users whose deposit settled. Lifetime, not the range: see above. */
  readonly funded: number;
  /** Users with an order that filled. Lifetime. */
  readonly traded: number;
  /** The latest snapshot per user, summed. A decimal string, never a float. */
  readonly aumUsd: string;
}

export const overview = async (reader: Reader, range: Range): Promise<Overview> => {
  const dayOf = sql`date_trunc('day', ${users.createdAt})`;

  const [[total], newUsers, walletsByKind, [funded], [traded], [aum]] = await Promise.all([
    reader.select({ n: sql<string>`count(*)::text` }).from(users),

    reader
      .select({ day: sql<string>`to_char(${dayOf}, 'YYYY-MM-DD')`, count: sql<string>`count(*)::text` })
      .from(users)
      .where(sql`${users.createdAt} >= ${range.from} and ${users.createdAt} < ${range.to}`)
      .groupBy(dayOf)
      .orderBy(asc(dayOf))
      .limit(MAX_ROWS),

    reader
      .select({ kind: wallets.kind, count: sql<string>`count(*)::text` })
      .from(wallets)
      .groupBy(wallets.kind)
      .orderBy(sql`count(*) desc`)
      .limit(MAX_ROWS),

    /* Settled, not merely attempted. A user whose only deposit failed has not
       been funded, and counting them overstates the conversion this feeds. */
    reader
      .select({ n: sql<string>`count(distinct ${fundingIntents.userId})::text` })
      .from(fundingIntents)
      .where(sql`${fundingIntents.status} = 'settled'`),

    reader
      .select({ n: sql<string>`count(distinct ${orders.userId})::text` })
      .from(orders)
      .where(sql`${orders.status} = 'filled'`),

    /*
     * The latest reading per user, then summed.
     *
     * `distinct on (user_id) … order by user_id, captured_at desc` reads the
     * newest row per user in a single pass of the primary key. Summing the
     * table instead would add every hourly reading ever taken — which, on the
     * seeded fixtures, reports 700 where the answer is 400: a figure 75% too
     * high that looks entirely plausible on a chart.
     */
    (() => {
      const latest = reader
        .selectDistinctOn([portfolioSnapshots.userId], { total: portfolioSnapshots.totalUsd })
        .from(portfolioSnapshots)
        .orderBy(portfolioSnapshots.userId, desc(portfolioSnapshots.capturedAt))
        .as("latest");
      return reader.select({ total: sql<string>`coalesce(sum(${latest.total}), 0)::text` }).from(latest);
    })(),
  ]);

  return {
    users: Number(total?.n ?? "0"),
    newUsers: newUsers.map((r) => ({ day: r.day, count: Number(r.count) })),
    walletsByKind: walletsByKind.map((r) => ({ kind: r.kind, count: Number(r.count) })),
    funded: Number(funded?.n ?? "0"),
    traded: Number(traded?.n ?? "0"),
    aumUsd: decimal(aum?.total ?? null),
  };
};
