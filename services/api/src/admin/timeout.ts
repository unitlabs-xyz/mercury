/**
 * A statement timeout around every admin query.
 *
 * Beside the range cap rather than instead of it: the cap stops the obvious
 * mistake, this stops the one nobody predicted. These are aggregates over the
 * tables that serve live traffic, and a bad plan on a table that has grown
 * since anyone last looked should end as a 500 on one internal page rather
 * than as a connection held open while people are trying to trade.
 *
 * **It has to be inside a transaction, and that is measured rather than
 * assumed.** The plan called for a `set local` in route middleware. `SET
 * LOCAL` outside a transaction block does nothing at all: after issuing it,
 * `show statement_timeout` still answers `0`. Inside one it answers `10s`,
 * and `0` again once the transaction commits — which is the other half of why
 * it belongs here. A plain `SET` would persist on whichever pooled connection
 * served the request and silently apply to a user's trade later.
 *
 * `sql.raw`, because `SET` takes no bind parameters: `set local
 * statement_timeout = $1` is a syntax error, measured as `Failed query: set
 * local statement_timeout = $1`. So the value is interpolated as text, and the
 * guard below is what keeps that from being a hole — it is a module constant
 * today, and an edit that made it anything else fails here rather than in SQL.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

/** Ten seconds. Longer than any of these queries should ever need. */
export const ADMIN_STATEMENT_TIMEOUT_MS = 10_000;

/**
 * What an admin query is given: reads, and nothing else.
 *
 * A transaction handle rather than the `Db` itself, which is also why the
 * query functions take this type — it is the one `db.transaction` can supply,
 * and it carries no `insert`, `update` or `delete`.
 */
export type Reader = Pick<Db, "select" | "execute">;

const timeoutMs = (): string => {
  const ms = ADMIN_STATEMENT_TIMEOUT_MS;
  /* Interpolated as text, so this is the gate rather than a comment. */
  if (!Number.isInteger(ms) || ms <= 0 || ms > 60_000) {
    throw new Error(`ADMIN_STATEMENT_TIMEOUT_MS must be whole milliseconds under a minute`);
  }
  return String(ms);
};

export const withTimeout = async <T>(db: Db, run: (reader: Reader) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = ${sql.raw(timeoutMs())}`);
    return run(tx);
  });
