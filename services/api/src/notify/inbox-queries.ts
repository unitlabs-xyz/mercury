import { and, count, desc, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities, instruments, notifications, tokens } from "../db/schema.js";
import type { ActivityRow } from "../routes/activity.js";
import type { NoticeKind } from "./inbox.js";

/**
 * The read side of the inbox. None of it reads the chain: the badge is polled
 * from every open tab, and after 23 October nothing polled may cost RPC.
 */

/** How long a notification is kept. Activity is the full record; this is the news. */
export const KEPT_MS = 90 * 24 * 60 * 60_000;
export const LIST_LIMIT = 50;

export interface InboxItem {
  readonly id: string;
  readonly kind: NoticeKind;
  readonly createdAt: Date;
  readonly readAt: Date | null;
  readonly activity: ActivityRow;
}

const kept = (now: Date) => gt(notifications.createdAt, new Date(now.getTime() - KEPT_MS));

export async function countUnread(db: Db, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), kept(now)));
  return row?.n ?? 0;
}

/**
 * The newest fifty, each with its activity row's words as they are now, and
 * the logo the feed would show. The joins are the feed's own (see
 * `portfolio/activity-queries.ts`).
 */
export async function readInbox(
  db: Db,
  userId: string,
  now: Date,
): Promise<{ items: readonly InboxItem[]; unread: number }> {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      activity: {
        id: activities.id,
        kind: activities.kind,
        occurredAt: activities.occurredAt,
        title: activities.title,
        subtitle: activities.subtitle,
        amountUsd: activities.amountUsd,
        txSignature: activities.txSignature,
        mint: activities.mint,
        logoUrl: instruments.logoUrl,
      },
    })
    .from(notifications)
    .innerJoin(activities, eq(activities.id, notifications.activityId))
    .leftJoin(tokens, eq(tokens.mint, activities.mint))
    .leftJoin(instruments, eq(instruments.id, tokens.instrumentId))
    .where(and(eq(notifications.userId, userId), kept(now)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(LIST_LIMIT);

  return { items: rows, unread: await countUnread(db, userId, now) };
}

/**
 * Read once, and the first time stands. False when there is no such
 * notification on this account, which is the same answer as someone else's.
 */
export async function markRead(db: Db, userId: string, id: string, now: Date): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now.toISOString()}::timestamptz)` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return updated.length === 1;
}

/** Everything up to the newest item the panel showed. Returns how many changed. */
export async function markAllRead(db: Db, userId: string, upTo: Date, now: Date): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt), lte(notifications.createdAt, upTo)),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

/** Past 90 days, deleted. The activity rows stay. */
export async function pruneNotifications(db: Db, now: Date): Promise<number> {
  const gone = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(now.getTime() - KEPT_MS)))
    .returning({ id: notifications.id });
  return gone.length;
}
