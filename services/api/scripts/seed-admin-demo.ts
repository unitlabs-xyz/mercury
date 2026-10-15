/**
 * Fill a local database with enough to make the admin dashboard worth looking
 * at, and put a Privy DID on the allowlist.
 *
 * Local only, and it says so: it refuses any DATABASE_URL that is not
 * localhost, because the fixtures it writes are fake users with fake orders
 * and there is no version of running this against a real database that is
 * wanted.
 *
 *   pnpm tsx --env-file=.env scripts/seed-admin-demo.ts [did:privy:…]
 *
 * The DID is optional. Given one, a user row is created for it so the account
 * exists before the first sign-in; it still has to go in
 * ADMIN_PRIVY_USER_IDS for the routes to answer.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { users } from "../src/db/schema.js";
import { applyMigrations } from "../src/db/migrate.js";
import { seedAdminFixtures } from "../src/admin/fixtures.js";
import type { Db } from "../src/db/client.js";

const url = process.env["DATABASE_URL"];
if (url === undefined || url.length === 0) throw new Error("DATABASE_URL is required");
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
  throw new Error(
    `refusing to seed fixtures into a database that is not local: ${url.replace(/\/\/[^@]*@/, "//***@")}`,
  );
}

const did = process.argv[2];

await applyMigrations(url);
console.log("migrations up to date");

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema }) as unknown as Db;

try {
  const already = await db.select({ id: users.id }).from(users).limit(1);
  if (already.length > 0) {
    console.log("this database already has users; not seeding again");
  } else {
    const ids = await seedAdminFixtures(db);
    console.log(
      `seeded 3 users, 2 instruments, 4 orders, 3 deposits from 2 chains (one failed), 4 snapshots, 2 basket actions`,
    );
    console.log(
      `  assets under management should read $400 — ${ids.userA.slice(0, 8)}… holds 150, the other 250`,
    );
  }

  if (did !== undefined) {
    const mine = await db.select({ id: users.id }).from(users).where(eq(users.privyUserId, did));
    if (mine.length === 0) {
      await db.insert(users).values({ privyUserId: did });
      console.log(`created a user for ${did}`);
    } else {
      console.log(`${did} already has a user row`);
    }
    console.log(`\nnow put this in services/api/.env and restart the API:\n  ADMIN_PRIVY_USER_IDS=${did}`);
  } else {
    console.log("\nno DID given. Sign in at the web app, then run:");
    console.log(
      '  pnpm tsx --env-file=.env scripts/seed-admin-demo.ts $(psql "$DATABASE_URL" -tAc \'select privy_user_id from "user" order by created_at desc limit 1\')',
    );
  }
} finally {
  await client.end();
}
