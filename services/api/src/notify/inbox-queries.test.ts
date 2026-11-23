import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, notifications, users, wallets } from "../db/schema.js";
import { primaryWalletId } from "../wallets/primary.js";
import { countUnread, markAllRead, markRead, pruneNotifications, readInbox } from "./inbox-queries.js";

const NOW = new Date("2026-10-27T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:q" }).returning();
  const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
  await mercuryWallet(db, user!.id);
  await mercuryWallet(db, other!.id);
  /** One activity row and its notification, created `age` ago. */
  const tell = async (userId: string, title: string, age: number) => {
    const [a] = await db
      .insert(activities)
      .values({
        userId,
        walletId: primaryWalletId(userId),
        kind: "transfer_in",
        title,
        subtitle: "From Tron · USDT",
        amountUsd: "250",
        mint: null,
      })
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

describe("the inbox, and an unlinked wallet", () => {
  it("hides what was about a wallet once it is unlinked, from the list and the count, and brings it back on relinking", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Mercury", DAY);
    const [linked] = await db
      .insert(wallets)
      .values({ userId, address: "Linked", kind: "external", isPrimary: false, linkedAt: ago(2 * DAY) })
      .returning();
    const [a] = await db
      .insert(activities)
      .values({
        userId,
        walletId: linked!.id,
        kind: "transfer_in",
        title: "Linked",
        amountUsd: "9",
        mint: null,
      })
      .returning();
    await db
      .insert(notifications)
      .values({ userId, kind: "money_in", activityId: a!.id, createdAt: ago(DAY / 2) });

    const titles = async () => (await readInbox(db, userId, NOW)).items.map((i) => i.activity.title);
    expect(await titles()).toEqual(["Linked", "Mercury"]);
    expect(await countUnread(db, userId, NOW)).toBe(2);

    await db
      .update(wallets)
      .set({ unlinkedAt: ago(DAY / 4) })
      .where(eq(wallets.id, linked!.id));
    expect(await titles()).toEqual(["Mercury"]);
    expect(await countUnread(db, userId, NOW)).toBe(1);
    expect((await readInbox(db, userId, NOW)).unread).toBe(1);

    await db.update(wallets).set({ unlinkedAt: null }).where(eq(wallets.id, linked!.id));
    expect(await titles()).toEqual(["Linked", "Mercury"]);
  });
});
