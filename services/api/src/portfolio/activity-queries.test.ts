import { describe, expect, it } from "vitest";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, users, wallets } from "../db/schema.js";
import { readActivity } from "./activity-queries.js";

const at = (h: number) => new Date(`2026-11-20T${String(h).padStart(2, "0")}:00:00.000Z`);

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:feed" }).returning();
  const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
  const userId = user!.id;
  const mercury = await mercuryWallet(db, userId);
  const theirs = await mercuryWallet(db, other!.id);
  const [linked] = await db
    .insert(wallets)
    .values({ userId, address: "Linked", kind: "external", isPrimary: false, linkedAt: at(1) })
    .returning();
  const row = (owner: string, walletId: string, h: number, title: string) => ({
    userId: owner,
    walletId,
    kind: "transfer_in",
    occurredAt: at(h),
    title,
    txSignature: `sig-${title}`,
    mint: "mint",
  });
  await db
    .insert(activities)
    .values([
      row(userId, mercury, 10, "mercury-10"),
      row(userId, linked!.id, 11, "linked-11"),
      row(userId, mercury, 12, "mercury-12"),
      row(userId, linked!.id, 13, "linked-13"),
      row(other!.id, theirs, 14, "theirs-14"),
    ]);
  return { db, userId, mercury, linked: linked!.id, theirs };
};

describe("readActivity", () => {
  it("reads one wallet's feed", async () => {
    const s = await seed();
    const feed = await readActivity(s.db, { userId: s.userId, walletIds: [s.linked] }, 10, null);
    expect(feed.map((r) => r.title)).toEqual(["linked-13", "linked-11"]);
  });

  it("reads several wallets as one feed, newest first, and pages through it", async () => {
    const s = await seed();
    const scope = { userId: s.userId, walletIds: [s.mercury, s.linked] };
    const first = await readActivity(s.db, scope, 3, null);
    expect(first.map((r) => r.title)).toEqual(["linked-13", "mercury-12", "linked-11"]);
    const last = first[2]!;
    const second = await readActivity(s.db, scope, 3, { occurredAt: last.occurredAt, id: last.id });
    expect(second.map((r) => r.title)).toEqual(["mercury-10"]);
  });

  it("never reads another person's rows, even with their wallet named", async () => {
    const s = await seed();
    expect(await readActivity(s.db, { userId: s.userId, walletIds: [s.theirs] }, 10, null)).toEqual([]);
  });

  it("reads nothing for no wallets", async () => {
    const s = await seed();
    expect(await readActivity(s.db, { userId: s.userId, walletIds: [] }, 10, null)).toEqual([]);
  });
});
