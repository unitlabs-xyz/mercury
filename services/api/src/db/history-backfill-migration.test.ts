import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { testDbUpTo } from "./testing.js";

/**
 * 0032 queues the history reader for every linked wallet followed before it
 * existed. Linking queues a read from now on; a wallet linked earlier has no
 * job and would say "Calculating…" for ever. Seeded as the schema stood at
 * 0031, with raw SQL, then 0032 runs over it.
 */

const read = async <T>(db: Db, query: string): Promise<T[]> =>
  ((await db.execute(sql.raw(query))) as unknown as { rows: T[] }).rows;

const run = async (db: Db, query: string): Promise<void> => {
  await db.execute(sql.raw(query));
};

const ALICE = "00000000-0000-4000-8000-00000000000a";
const MERCURY = "00000000-0000-4000-8000-0000000000a1";
const LINKED = "00000000-0000-4000-8000-0000000000a2";
const UNLINKED = "00000000-0000-4000-8000-0000000000a3";
const ALREADY = "00000000-0000-4000-8000-0000000000a4";

describe("migration 0032, queueing linked wallets' history", () => {
  it("queues every followed linked wallet without a job, and nothing else", async () => {
    const { db, migrateRest } = await testDbUpTo("0031_position_estimated_cost");
    await run(db, `insert into "user" (id, privy_user_id) values ('${ALICE}', 'did:privy:alice')`);
    await run(
      db,
      `insert into wallet (id, user_id, address, kind, is_primary, linked_at, unlinked_at) values
        ('${MERCURY}', '${ALICE}', 'MercuryAddr', 'privy_embedded', true, null, null),
        ('${LINKED}', '${ALICE}', 'LinkedAddr', 'external', false, now(), null),
        ('${UNLINKED}', '${ALICE}', 'UnlinkedAddr', 'external', false, now(), now()),
        ('${ALREADY}', '${ALICE}', 'AlreadyAddr', 'external', false, now(), null)`,
    );
    await run(
      db,
      `insert into history_job (wallet_id, user_id, status, cursors) values
        ('${ALREADY}', '${ALICE}', 'done', '{"acct":"SigKept"}')`,
    );

    await migrateRest();

    const jobs = await read<{ wallet_id: string; status: string; cursors: unknown }>(
      db,
      `select wallet_id, status, cursors from history_job order by wallet_id`,
    );
    expect(jobs).toEqual([
      { wallet_id: LINKED, status: "queued", cursors: {} },
      // A wallet that already had a job keeps it as it was.
      { wallet_id: ALREADY, status: "done", cursors: { acct: "SigKept" } },
    ]);
  });
});
