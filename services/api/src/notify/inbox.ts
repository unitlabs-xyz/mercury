import type { Db } from "../db/client.js";
import { notifications } from "../db/schema.js";

/**
 * The write side of the inbox: one helper every writer calls, so none of them
 * knows the table's shape.
 *
 * Called inside the writer's own transaction, with the ids its activity insert
 * returned. A notification never exists without its activity row, and an
 * activity row worth telling never commits without its notification.
 */
export type NoticeKind = "money_in" | "dividend" | "loan_alert";

export interface Noticed {
  readonly activityId: string;
  readonly kind: NoticeKind;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Writer = Db | Tx;

/** How many were new. A repeat is absorbed by the unique index on `activity_id`. */
export async function notifyFor(db: Writer, userId: string, rows: readonly Noticed[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(notifications)
    .values(rows.map((r) => ({ userId, kind: r.kind, activityId: r.activityId })))
    .onConflictDoNothing({ target: notifications.activityId })
    .returning({ id: notifications.id });
  return inserted.length;
}
