import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { activities, notifications, users } from "../db/schema.js";
import { countUnread, markAllRead, markRead, pruneNotifications, readInbox } from "./inbox-queries.js";

const NOW = new Date("2026-10-27T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:q" }).returning();
  const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
  /** One activity row and its notification, created `age` ago. */
  const tell = async (userId: string, title: string, age: number) => {
    const [a] = await db
      .insert(activities)
      .values({ userId, kind: "transfer_in", title, subtitle: "From Tron · USDT", amountUsd: "250", mint: null })
      .returning();
    const [n] = await db
      .insert(notifications)
      .values({ userId, kind: "money_in", activityId: a!.id, createdAt: ago(age) })
      .returning();
    return n!;
  };
  return { db, userId: user!.id, otherId: other!.id, tell };
};

describe("readInbox", () => {
  it("lists newest first, with the activity's own words, and counts the unread", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Older", 2 * DAY);
    await tell(userId, "Newer", DAY);

    const { items, unread } = await readInbox(db, userId, NOW);
    expect(items.map((i) => i.activity.title)).toEqual(["Newer", "Older"]);
    expect(items[0]!.activity.subtitle).toBe("From Tron · USDT");
    expect(items[0]!.kind).toBe("money_in");
    expect(items[0]!.readAt).toBeNull();
    expect(unread).toBe(2);
  });

  it("shows only the caller's", async () => {
    const { db, userId, otherId, tell } = await seed();
    await tell(otherId, "Theirs", DAY);
    expect((await readInbox(db, userId, NOW)).items).toEqual([]);
  });

  it("stops at 90 days, in the list and in the count", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Old", 91 * DAY);
    const { items, unread } = await readInbox(db, userId, NOW);
    expect(items).toEqual([]);
    expect(unread).toBe(0);
    expect(await countUnread(db, userId, NOW)).toBe(0);
  });

  it("lists at most 50", async () => {
    const { db, userId, tell } = await seed();
    for (let i = 0; i < 55; i++) await tell(userId, `n${i}`, i * 60_000);
    const { items, unread } = await readInbox(db, userId, NOW);
    expect(items).toHaveLength(50);
    expect(unread).toBe(55);
  });
});

describe("markRead", () => {
  it("marks one read and keeps the first time on a second read", async () => {
    const { db, userId, tell } = await seed();
    const n = await tell(userId, "A", DAY);

    expect(await markRead(db, userId, n.id, NOW)).toBe(true);
    expect(await markRead(db, userId, n.id, new Date(NOW.getTime() + DAY))).toBe(true);

    const [row] = await db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row!.readAt).toEqual(NOW);
    expect(await countUnread(db, userId, NOW)).toBe(0);
  });

  it("refuses someone else's", async () => {
    const { db, userId, otherId, tell } = await seed();
    const theirs = await tell(otherId, "Theirs", DAY);
    expect(await markRead(db, userId, theirs.id, NOW)).toBe(false);
    expect(await countUnread(db, otherId, NOW)).toBe(1);
  });
});

describe("markAllRead", () => {
  /* Something that arrived after the panel was drawn was never seen. */
  it("marks only what was at or before upTo", async () => {
    const { db, userId, tell } = await seed();
    const shown = await tell(userId, "Shown", DAY);
    await tell(userId, "Arrived later", 60_000);

    expect(await markAllRead(db, userId, shown.createdAt, NOW)).toBe(1);
    const { items, unread } = await readInbox(db, userId, NOW);
    expect(unread).toBe(1);
    expect(items.find((i) => i.activity.title === "Arrived later")!.readAt).toBeNull();
  });
});

describe("pruneNotifications", () => {
  it("drops notifications past 90 days and keeps their activity rows", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Old", 91 * DAY);
    await tell(userId, "Recent", DAY);

    expect(await pruneNotifications(db, NOW)).toBe(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
    expect(await db.select().from(activities)).toHaveLength(2);
  });
});
