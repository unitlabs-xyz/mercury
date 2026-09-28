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
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  return db as unknown as Db;
}
