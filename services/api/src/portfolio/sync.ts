import { eq } from "drizzle-orm";
import { logger } from "../log/index.js";
import type { Db } from "../db/client.js";
import { users, wallets } from "../db/schema.js";
import { applyReconciliation, loadHeldTokens, type ReconcileDeps } from "./apply.js";
import { planReconciliation } from "./reconcile.js";

const log = logger("position-sync");

export interface SyncSummary {
  readonly wallets: number;
  readonly reconciled: number;
  readonly failed: number;
  /** Lots, disposals and activity rows written. Zero on a pass that found nothing new. */
  readonly written: number;
}

/**
 * Bring every account's records in line with the chain.
 *
 * This is the background half of the system, and it is the only thing that
 * writes a position. A read never does: `GET /v1/portfolio` reports what is
 * known and leaves it at that, so the same request twice cannot produce two
 * different sets of books.
 *
 * One wallet failing does not stop the rest. A wallet we cannot read is a
 * wallet whose position stays where it was — stale but right — which is the
 * correct answer when an upstream is down, and better than half a pass.
 */
/**
 * Wallets reconciled at once.
 *
 * Bounded, not unbounded. Firing every wallet at the node together drops
 * connections long before it meets a rate limit — a thousand parallel requests
 * measured on 29 September 2026 lost a third of themselves to ECONNRESET. A
 * handful in flight is also what gives `batchedRpc` something to collect: one
 * wallet at a time is one call at a time, and a batch of one is not a batch.
 */
const CONCURRENCY = 8;

export async function syncAllPositions(db: Db, deps: ReconcileDeps): Promise<SyncSummary> {
  const rows = await db
    .select({ userId: users.id, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.isPrimary, true));

  let reconciled = 0;
  let failed = 0;
  let written = 0;

  // A shared index rather than a chunked split, so a slow wallet holds up only
  // itself. Counters are safe to share: this runs on one thread.
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const row = rows[next++];
      if (row === undefined) return;
      try {
        const held = await loadHeldTokens(db, deps, row.userId, row.address);
        if (held.length === 0) continue;
        const plan = planReconciliation(held, new Date());
        await applyReconciliation(db, row.userId, plan);
        reconciled += 1;
        written += plan.lots.length + plan.disposals.length + plan.activity.length;
      } catch (error: unknown) {
        failed += 1;
        // The wallet, never the address: an address in a log is a person's
        // holdings in a log.
        log.error({ userId: row.userId, err: error }, "wallet reconcile failed");
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  return { wallets: rows.length, reconciled, failed, written };
}
