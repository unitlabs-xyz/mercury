import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../db/testing.js";

/**
 * The indexes the admin aggregates rely on, asserted against a real catalog.
 *
 * Declared in `schema.ts` and created by a migration are two different things,
 * and only the second one makes a query fast. A `schema.ts` edit with no
 * generated migration typechecks, passes every other test, and is a sequential
 * scan in production.
 *
 * Every existing index on these tables leads with `user_id`, which cannot
 * serve a query that does not filter on it — so without these four, every
 * question the dashboard asks is a full scan of a table live traffic is
 * writing to.
 *
 * The migration is committed exactly as `drizzle-kit generate` wrote it. The
 * plan called for `IF NOT EXISTS` by hand; it guards nothing here — the
 * advisory lock in `db/migrate.ts` and drizzle's `__drizzle_migrations` table
 * already make double application impossible — and 13 of the 16 `CREATE INDEX`
 * statements already in `drizzle/` omit it. `CONCURRENTLY` is genuinely
 * unavailable: `pg-core/dialect.js` runs every migration inside
 * `session.transaction`, which it cannot be used in.
 */

/**
 * Rows out of `db.execute`, whichever driver answered.
 *
 * postgres.js returns the rows array itself; PGlite returns
 * `{ rows, fields, command, affectedRows, rowCount }`. Both measured. A test
 * that read `result.length` would be `undefined` under PGlite — which is how
 * this one started.
 */
const rowsOf = (result: unknown): readonly unknown[] =>
  Array.isArray(result) ? result : ((result as { rows?: readonly unknown[] }).rows ?? []);

describe("the indexes the admin queries need", () => {
  it.each([
    ["order", "order_created_status_idx"],
    ["activity", "activity_occurred_kind_idx"],
    ["funding_intent", "funding_intent_created_chain_idx"],
    ["portfolio_snapshot", "portfolio_snapshot_captured_idx"],
  ])("exists on %s after the migrations run", async (table, name) => {
    const db = await testDb();

    const found = await db.execute(
      sql`select indexname from pg_indexes where tablename = ${table} and indexname = ${name}`,
    );

    expect(rowsOf(found)).toHaveLength(1);
  });

  it("leads each one with its time column, which is the whole point", async () => {
    /* A time-first index serves "every order last Tuesday"; a user-first one
       does not, however many columns follow. Reversing the column order in
       schema.ts would still create an index of the right name — so the name
       alone is not the assertion worth making. */
    const db = await testDb();

    const found = await db.execute(
      sql`select indexname, indexdef from pg_indexes
          where indexname in ('order_created_status_idx', 'activity_occurred_kind_idx',
                              'funding_intent_created_chain_idx', 'portfolio_snapshot_captured_idx')`,
    );
    const defs = rowsOf(found) as readonly { indexname: string; indexdef: string }[];

    const leading = (name: string) =>
      /\(([^,)]+)/.exec(defs.find((d) => d.indexname === name)?.indexdef ?? "")?.[1]?.trim();

    expect(leading("order_created_status_idx")).toBe("created_at");
    expect(leading("activity_occurred_kind_idx")).toBe("occurred_at");
    expect(leading("funding_intent_created_chain_idx")).toBe("created_at");
    expect(leading("portfolio_snapshot_captured_idx")).toBe("captured_at");
  });
});
