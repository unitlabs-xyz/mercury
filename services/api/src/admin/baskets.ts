/**
 * Basket enrollments and exits, and anything the reconciler has lost.
 *
 * `byKind` and `byState` are the range; `stuck` deliberately is not. Stuck is
 * an alert rather than a statistic — an action that jammed two months ago is
 * still jammed, and a thirty-day window would hide the one thing on this panel
 * somebody has to act on.
 *
 * Stuck means `pending` with `reconcile_after` in the past: the reconciler was
 * due to look at it and has not resolved it. Every other state —
 * `settled`, `failed`, `cancelled`, `exhausted` — is terminal, and `pending`
 * with its retry still ahead is in flight, not lost.
 *
 * Reads `basket_action_reconcile_idx` — `(reconciliation_state,
 * reconcile_after)` — which already exists for the reconciler itself.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { basketActions } from "../db/schema.js";
import type { Reader } from "./timeout.js";
import type { Range } from "./range.js";

/** A hard cap, as on every query here. */
const MAX_ROWS = 200;

export interface BasketStats {
  readonly byKind: readonly { kind: string; count: number }[];
  readonly byState: readonly { state: string; count: number }[];
  /** Pending past its retry time. Lifetime, not the range: see above. */
  readonly stuck: number;
}

export const basketStats = async (reader: Reader, range: Range): Promise<BasketStats> => {
  const inRange = and(gte(basketActions.createdAt, range.from), lt(basketActions.createdAt, range.to));

  const [byKind, byState, [stuck]] = await Promise.all([
    reader
      .select({ kind: basketActions.kind, count: sql<string>`count(*)::text` })
      .from(basketActions)
      .where(inRange)
      .groupBy(basketActions.kind)
      .orderBy(asc(basketActions.kind))
      .limit(MAX_ROWS),

    reader
      .select({ state: basketActions.reconciliationState, count: sql<string>`count(*)::text` })
      .from(basketActions)
      .where(inRange)
      .groupBy(basketActions.reconciliationState)
      .orderBy(asc(basketActions.reconciliationState))
      .limit(MAX_ROWS),

    reader
      .select({ n: sql<string>`count(*)::text` })
      .from(basketActions)
      .where(
        and(eq(basketActions.reconciliationState, "pending"), sql`${basketActions.reconcileAfter} < now()`),
      ),
  ]);

  return {
    byKind: byKind.map((r) => ({ kind: r.kind, count: Number(r.count) })),
    byState: byState.map((r) => ({ state: r.state ?? "unset", count: Number(r.count) })),
    stuck: Number(stuck?.n ?? "0"),
  };
};
