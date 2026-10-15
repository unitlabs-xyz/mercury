/**
 * How old the newest row of each kind is.
 *
 * The cheapest possible answer to "are the background jobs alive", and it
 * needs no telemetry at all — three `max()` reads against indexes that exist
 * for this. Worth having even with Grafana up, because this is the one check
 * that answers from inside the API rather than from a stack that could itself
 * be down.
 *
 * `portfolio_snapshot` is the row that matters most. It is the only record of
 * what an account used to be worth, nothing can reconstruct a reading that was
 * never taken, and the job that writes it runs hourly — so an age over about
 * ninety minutes is a problem that is still growing.
 *
 * Three typed selects rather than one `db.execute` of subqueries, which is
 * not a style preference. `db.execute` hands back whatever the driver
 * returned, and the two drivers in this repository disagree: postgres.js
 * answers an array of rows, PGlite answers `{ rows, fields, command }`, so
 * `result[0]` is a row in production and `undefined` under test. It also
 * skips drizzle's column mappers — PGlite gives
 * `"2026-10-15 16:51:03.627+05"` where postgres.js gives a `Date`. Both
 * measured. A typed select goes through `mapResultRow` and the column's own
 * mapper on either driver, so this returns `Date | null` and means it.
 */
import { max } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities, portfolioSnapshots, priceBars } from "../db/schema.js";

export interface Freshness {
  readonly snapshotAt: string | null;
  readonly priceBarAt: string | null;
  readonly activityAt: string | null;
  readonly now: string;
}

const iso = (value: Date | null | undefined): string | null => value?.toISOString() ?? null;

export const freshness = async (db: Db): Promise<Freshness> => {
  /*
   * Concurrent because they are independent, and each is one `max()` against
   * an index. The pool serves three at once without noticing.
   */
  const [snapshot, priceBar, activity] = await Promise.all([
    db.select({ at: max(portfolioSnapshots.capturedAt) }).from(portfolioSnapshots),
    db.select({ at: max(priceBars.bucketStart) }).from(priceBars),
    db.select({ at: max(activities.occurredAt) }).from(activities),
  ]);

  return {
    snapshotAt: iso(snapshot[0]?.at),
    priceBarAt: iso(priceBar[0]?.at),
    activityAt: iso(activity[0]?.at),
    /*
     * The API's clock, not the database's.
     *
     * `now()` through `db.execute` is the format divergence described above
     * with no column mapper to save it, and a raw-SQL expression in a select
     * has none either. The reading this feeds is "is the hourly job alive",
     * judged against a ninety-minute threshold; container clocks under NTP
     * differ by milliseconds, and an API whose clock is wrong by anything
     * that would matter here has a louder problem than this route.
     */
    now: new Date().toISOString(),
  };
};
