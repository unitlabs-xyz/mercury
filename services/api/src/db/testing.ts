import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";
import type { Db } from "./client.js";

/**
 * A real Postgres, in process, with the real migrations applied.
 *
 * The tests that need this are the ones about a unique index doing its job.
 * A fake would assert our own belief about the index back to us, which is not
 * a test of anything.
 *
 * The cast is the single concession: drizzle types a PGlite handle differently
 * from a postgres-js one, though the query API they expose is identical.
 */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/**
 * A real Postgres migrated only as far as `tag`, and a way to apply the rest.
 *
 * For testing what a migration does to rows that existed before it, which is
 * the case that meets production and the one `testDb` cannot reach: there,
 * every migration runs over empty tables. Rows are seeded with raw SQL in
 * between, because the drizzle schema describes the tables as they end up,
 * not as they were at `tag`.
 *
 * The earlier migrations are run from a copy of the folder whose journal stops
 * at `tag`; `migrateRest` then runs the real folder, and drizzle applies only
 * what is newer than what it already recorded.
 */
export async function testDbUpTo(tag: string): Promise<{ db: Db; migrateRest: () => Promise<void> }> {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  const stop = journal.entries.findIndex((e) => e.tag === tag);
  if (stop === -1) throw new Error(`no migration tagged ${tag}`);

  const partial = mkdtempSync(join(tmpdir(), "mercury-migrations-"));
  mkdirSync(join(partial, "meta"));
  const kept = journal.entries.slice(0, stop + 1);
  writeFileSync(join(partial, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: kept }));
  for (const entry of kept)
    copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(partial, `${entry.tag}.sql`));

  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: partial });
  return {
    db: db as unknown as Db,
    migrateRest: async () => migrate(db, { migrationsFolder: MIGRATIONS }),
  };
}

/**
 * Gives a test user the Mercury wallet sign-in would have given them, and
 * returns its id.
 *
 * Every per-wallet row carries `wallet_id`, and the writers that do not yet
 * know which wallet they act for take the person's primary one, so a user with
 * no wallet can own no rows. The address only has to be unique; the user's id
 * makes it so.
 */
export async function mercuryWallet(db: Db, userId: string, address = `wallet-${userId}`): Promise<string> {
  const [row] = await db
    .insert(schema.wallets)
    .values({ userId, address, kind: "privy_embedded", isPrimary: true })
    .returning({ id: schema.wallets.id });
  return row!.id;
}
