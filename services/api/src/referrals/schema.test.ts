import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { referrals, users } from "../db/schema.js";

type Db = Awaited<ReturnType<typeof testDb>>;
const user = async (db: Db, n: number) =>
  (await db.insert(users).values({ privyUserId: `did:privy:${n}` }).returning())[0]!;

describe("referral table", () => {
  it("keeps one inviter per friend", async () => {
    const db = await testDb();
    const [a, b, friend] = [await user(db, 1), await user(db, 2), await user(db, 3)];
    await db.insert(referrals).values({ inviterId: a.id, friendId: friend.id, code: "abcdefgh" });
    await expect(
      db.insert(referrals).values({ inviterId: b.id, friendId: friend.id, code: "bcdefghj" }),
    ).rejects.toThrow();
  });

  it("refuses a referral of yourself", async () => {
    const db = await testDb();
    const a = await user(db, 1);
    await expect(db.insert(referrals).values({ inviterId: a.id, friendId: a.id, code: "abcdefgh" })).rejects.toThrow();
  });

  it("gives a code to one user only", async () => {
    const db = await testDb();
    const [a, b] = [await user(db, 1), await user(db, 2)];
    await db.update(users).set({ referralCode: "abcdefgh" }).where(eq(users.id, a.id));
    await expect(db.update(users).set({ referralCode: "abcdefgh" }).where(eq(users.id, b.id))).rejects.toThrow();
  });
});
