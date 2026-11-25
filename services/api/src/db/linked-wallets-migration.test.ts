import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { testDbUpTo } from "./testing.js";

/**
 * 0030 gives every per-wallet row a wallet, from the person's Mercury wallet.
 *
 * `testDb` runs it over empty tables, which proves only that it parses. What
 * meets production is rows: these are seeded as the schema stood at 0029, with
 * raw SQL because the drizzle schema now describes the tables after 0030, and
 * then 0030 runs over them.
 */

const read = async <T>(db: Db, query: string): Promise<T[]> =>
  ((await db.execute(sql.raw(query))) as unknown as { rows: T[] }).rows;

const run = async (db: Db, query: string): Promise<void> => {
  await db.execute(sql.raw(query));
};

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const ALICE_WALLET = "00000000-0000-4000-8000-0000000000a1";
const BOB_WALLET = "00000000-0000-4000-8000-0000000000b1";
const INSTRUMENT = "00000000-0000-4000-8000-000000000101";
const TOKEN = "00000000-0000-4000-8000-000000000201";
const ALICE_ORDER = "00000000-0000-4000-8000-000000000301";
const BOB_ORDER = "00000000-0000-4000-8000-000000000302";

/** The nine tables that gain `wallet_id`. */
const TABLES = [
  "position",
  "lot",
  "disposal",
  "order",
  "activity",
  "portfolio_snapshot",
  "loan_event",
  "loan_alert",
  "earn_event",
] as const;

/** One row in every per-wallet table for `userId`, as 0029 had them. */
const seedRowsFor = async (db: Db, userId: string, orderId: string, n: number) => {
  await run(
    db,
    `INSERT INTO "position" ("user_id", "instrument_id", "shares", "cost_basis_usd", "avg_unit_cost_usd")
     VALUES ('${userId}', '${INSTRUMENT}', '2', '200', '100')`,
  );
  await run(
    db,
    `INSERT INTO "lot" ("user_id", "token_id", "instrument_id", "token_qty", "shares", "unit_cost_usd", "source")
     VALUES ('${userId}', '${TOKEN}', '${INSTRUMENT}', 200000000, '2', '100', 'buy')`,
  );
  await run(
    db,
    `INSERT INTO "disposal" ("user_id", "token_id", "instrument_id", "token_qty", "shares", "kind", "occurred_at")
     VALUES ('${userId}', '${TOKEN}', '${INSTRUMENT}', 100000000, '1', 'transfer_out', now())`,
  );
  await run(
    db,
    `INSERT INTO "order" ("id", "user_id", "instrument_id", "side", "usd_amount", "decision", "status")
     VALUES ('${orderId}', '${userId}', '${INSTRUMENT}', 'buy', '100', '{}'::jsonb, 'filled')`,
  );
  await run(
    db,
    `INSERT INTO "activity" ("user_id", "kind", "title", "tx_signature", "mint")
     VALUES ('${userId}', 'transfer_in', 'Added cash', 'sig-${n}', 'USDC')`,
  );
  await run(
    db,
    `INSERT INTO "portfolio_snapshot" ("user_id", "captured_at", "total_usd", "stocks_usd", "cash_usd")
     VALUES ('${userId}', '2026-11-01T10:00:00Z', '300', '200', '100')`,
  );
  await run(
    db,
    `INSERT INTO "loan_event" ("user_id", "kind", "debt_after_usd", "collateral_after_usd", "tx_signature", "occurred_at")
     VALUES ('${userId}', 'borrow', '50', '200', 'loan-sig-${n}', now())`,
  );
  await run(db, `INSERT INTO "loan_alert" ("user_id", "health") VALUES ('${userId}', 'margin_call')`);
  await run(
    db,
    `INSERT INTO "earn_event" ("user_id", "kind", "usdc_amount", "vault", "tx_signature", "occurred_at")
     VALUES ('${userId}', 'deposit', '20', 'Vault', 'earn-sig-${n}', now())`,
  );
};

/** The database as 0029 left it, with Alice and Bob in it, then 0030 applied. */
const migrated = async () => {
  const { db, migrateRest } = await testDbUpTo("0029_notifications");
  await run(
    db,
    `INSERT INTO "user" ("id", "privy_user_id") VALUES
       ('${ALICE}', 'did:privy:alice'), ('${BOB}', 'did:privy:bob')`,
  );
  await run(
    db,
    `INSERT INTO "wallet" ("id", "user_id", "address", "kind", "is_primary") VALUES
       ('${ALICE_WALLET}', '${ALICE}', 'AliceWallet', 'privy_embedded', true),
       ('${BOB_WALLET}', '${BOB}', 'BobWallet', 'privy_embedded', true)`,
  );
  await run(
    db,
    `INSERT INTO "instrument" ("id", "ticker", "name") VALUES ('${INSTRUMENT}', 'NVDA', 'Nvidia')`,
  );
  await run(
    db,
    `INSERT INTO "token" ("id", "instrument_id", "mint", "issuer", "symbol", "decimals")
     VALUES ('${TOKEN}', '${INSTRUMENT}', 'NVDAxMint', 'backed', 'NVDAx', 8)`,
  );
  await seedRowsFor(db, ALICE, ALICE_ORDER, 1);
  await seedRowsFor(db, BOB, BOB_ORDER, 2);

  await migrateRest();
  return db;
};

describe("0030_linked_wallets over existing rows", () => {
  it("gives every one of a person's rows their Mercury wallet", async () => {
    const db = await migrated();
    for (const table of TABLES) {
      const rows = await read<{ wallet_id: string | null }>(
        db,
        `SELECT "wallet_id" FROM "${table}" WHERE "user_id" = '${ALICE}'`,
      );
      expect(rows, table).toEqual([{ wallet_id: ALICE_WALLET }]);
    }
  });

  it("files each person's rows under their own wallet, never someone else's", async () => {
    const db = await migrated();
    for (const table of TABLES) {
      const rows = await read<{ wallet_id: string }>(
        db,
        `SELECT "wallet_id" FROM "${table}" WHERE "user_id" = '${BOB}'`,
      );
      expect(rows, table).toEqual([{ wallet_id: BOB_WALLET }]);
    }
  });

  it("marks every ledger row it found as Mercury's own, with no price recorded", async () => {
    const db = await migrated();
    expect(await read(db, `SELECT DISTINCT "origin_source", "price_usd" FROM "loan_event"`)).toEqual([
      { origin_source: "mercury", price_usd: null },
    ]);
    expect(await read(db, `SELECT DISTINCT "origin_source" FROM "earn_event"`)).toEqual([
      { origin_source: "mercury" },
    ]);
  });

  it("leaves every existing wallet unlabelled, never linked and never unlinked", async () => {
    const db = await migrated();
    expect(
      await read(db, `SELECT DISTINCT "label", "linked_at", "unlinked_at", "last_viewed_at" FROM "wallet"`),
    ).toEqual([{ label: null, linked_at: null, unlinked_at: null, last_viewed_at: null }]);
  });

  it("keys the moved rows by wallet, so a second wallet of the same person can hold the same things", async () => {
    const db = await migrated();
    const linked = "00000000-0000-4000-8000-0000000000a2";
    await run(
      db,
      `INSERT INTO "wallet" ("id", "user_id", "address", "kind", "is_primary")
       VALUES ('${linked}', '${ALICE}', 'AlicePhantom', 'external', false)`,
    );
    // The same signature and mint Alice's Mercury wallet already has: a move
    // between her own wallets is seen by both.
    await run(
      db,
      `INSERT INTO "activity" ("user_id", "wallet_id", "kind", "title", "tx_signature", "mint")
       VALUES ('${ALICE}', '${linked}', 'transfer_out', 'Sent', 'sig-1', 'USDC')`,
    );
    await run(
      db,
      `INSERT INTO "position" ("user_id", "wallet_id", "instrument_id", "shares", "cost_basis_usd", "avg_unit_cost_usd")
       VALUES ('${ALICE}', '${linked}', '${INSTRUMENT}', '1', '0', '0')`,
    );
    await run(
      db,
      `INSERT INTO "loan_alert" ("wallet_id", "user_id", "health") VALUES ('${linked}', '${ALICE}', 'healthy')`,
    );
    expect(await read(db, `SELECT count(*)::int AS n FROM "activity" WHERE "user_id" = '${ALICE}'`)).toEqual([
      { n: 2 },
    ]);
    // And the same wallet still cannot hold the same movement twice.
    await expect(
      run(
        db,
        `INSERT INTO "activity" ("user_id", "wallet_id", "kind", "title", "tx_signature", "mint")
         VALUES ('${ALICE}', '${ALICE_WALLET}', 'transfer_in', 'Again', 'sig-1', 'USDC')`,
      ),
    ).rejects.toThrow();
  });
});
