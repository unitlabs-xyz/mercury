import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";

/**
 * Where the generated SQL lives, resolved from this file rather than from the
 * working directory — the container runs from `/app/services/api` and a test
 * runs from anywhere.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * A key for `pg_advisory_lock`, so two containers booting together cannot both
 * decide 0007 is unapplied and both try to create the same table. Arbitrary and
 * fixed: any other process using the same integer would block us, and nothing
 * else in this system takes advisory locks.
 */
const LOCK_KEY = 4_919_207;

/**
 * Bring the database up to the code's schema, before the server answers anything.
 *
 * This exists because the opposite order failed in production. On 30 September a
 * deploy carrying `portfolio_snapshot` started serving traffic before anyone had
 * run the migration, and the hourly job logged `relation "portfolio_snapshot"
 * does not exist` against every account until someone noticed. Nothing in the
 * pipeline ordered the two, so the next schema change would have done it again.
 *
 * Running it here rather than as a release step is what the repository can
 * guarantee on its own: a server that has not migrated has not started, on every
 * platform and on a laptop, with no deploy configuration to keep in step.
 *
 * Its own connection, and only one: the pool the app runs on is sized for
 * serving, and a migration holding one of those while it waits on a lock is a
 * request that cannot be served.
 */
export async function applyMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  try {
    await db.execute(sql`select pg_advisory_lock(${LOCK_KEY})`);
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
    }
  } finally {
    await client.end();
  }
}
