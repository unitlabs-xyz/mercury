import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities } from "../db/schema.js";
import type { ActivityRow, Cursor } from "../routes/activity.js";

/**
 * One page of the feed, newest first. The cursor compares the pair
 * (occurred_at, id) so two rows written in the same transaction — a transfer and
 * the dividend it revealed — cannot straddle a page boundary and be lost.
 */
export async function readActivity(
  db: Db,
  userId: string,
  limit: number,
  cursor: Cursor | null,
): Promise<readonly ActivityRow[]> {
  const before =
    cursor === null
      ? undefined
      : or(
          lt(activities.occurredAt, cursor.occurredAt),
          and(eq(activities.occurredAt, cursor.occurredAt), lt(activities.id, sql`${cursor.id}::uuid`)),
        );

  const rows = await db
    .select({
      id: activities.id,
      kind: activities.kind,
      occurredAt: activities.occurredAt,
      title: activities.title,
      subtitle: activities.subtitle,
      amountUsd: activities.amountUsd,
      txSignature: activities.txSignature,
    })
    .from(activities)
    .where(before === undefined ? eq(activities.userId, userId) : and(eq(activities.userId, userId), before))
    .orderBy(desc(activities.occurredAt), desc(activities.id))
    .limit(limit);

  return rows;
}
