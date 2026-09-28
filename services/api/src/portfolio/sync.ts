import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, wallets } from "../db/schema.js";
import { applyReconciliation, loadHeldTokens, type ReconcileDeps } from "./apply.js";
import { planReconciliation } from "./reconcile.js";

export interface SyncSummary {
  readonly wallets: number;
  readonly reconciled: number;
  readonly failed: number;
  /** Lots and activity rows written. Zero on a pass that found nothing new. */
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
export async function syncAllPositions(db: Db, deps: ReconcileDeps): Promise<SyncSummary> {
  const rows = await db
    .select({ userId: users.id, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.isPrimary, true));

  let reconciled = 0;
  let failed = 0;
  let written = 0;

  for (const row of rows) {
    try {
      const held = await loadHeldTokens(db, deps, row.userId, row.address);
      if (held.length === 0) continue;
      const plan = planReconciliation(held, new Date());
      await applyReconciliation(db, row.userId, plan);
      reconciled += 1;
      written += plan.lots.length + plan.activity.length;
    } catch (error: unknown) {
      failed += 1;
      // The wallet, never the address: an address in a log is a person's
      // holdings in a log.
      console.error(`position-sync: wallet for user ${row.userId} failed`, error);
    }
  }

  return { wallets: rows.length, reconciled, failed, written };
}
