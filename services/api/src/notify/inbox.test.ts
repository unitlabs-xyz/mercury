import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { activities, notifications, users } from "../db/schema.js";
import { notifyFor } from "./inbox.js";

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:inbox" }).returning();
  const [row] = await db
    .insert(activities)
    .values({ userId: user!.id, kind: "transfer_in", title: "Added cash", mint: null })
    .returning();
  return { db, userId: user!.id, activityId: row!.id };
};

describe("notifyFor", () => {
  it("writes one unread notification for an activity row", async () => {
    const { db, userId, activityId } = await seed();
    const written = await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);

    expect(written).toBe(1);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("money_in");
    expect(rows[0]!.activityId).toBe(activityId);
    expect(rows[0]!.readAt).toBeNull();
  });

  /* The unique index doing its job: a pass that runs twice tells once. */
  it("writes nothing the second time for the same activity row", async () => {
    const { db, userId, activityId } = await seed();
    await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);
    const again = await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);

    expect(again).toBe(0);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("does nothing with nothing to tell", async () => {
    const { db, userId } = await seed();
    expect(await notifyFor(db, userId, [])).toBe(0);
  });

  it("goes when its activity row goes", async () => {
    const { db, userId, activityId } = await seed();
    await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);
    await db.delete(activities).where(eq(activities.id, activityId));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});
