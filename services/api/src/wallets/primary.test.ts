import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, users, wallets } from "../db/schema.js";
import { primaryWalletId } from "./primary.js";

const person = async (db: Awaited<ReturnType<typeof testDb>>, privyUserId: string) => {
  const [user] = await db.insert(users).values({ privyUserId }).returning();
  return user!.id;
};

const feedRow = (userId: string) => ({
  userId,
  walletId: primaryWalletId(userId),
  kind: "transfer_in",
  title: "Added cash",
});

describe("primaryWalletId", () => {
  it("files a row under the person's Mercury wallet", async () => {
    const db = await testDb();
    const userId = await person(db, "did:privy:p");
    const mercury = await mercuryWallet(db, userId);

    const [row] = await db.insert(activities).values(feedRow(userId)).returning();

    expect(row!.walletId).toBe(mercury);
  });

  it("never files it under a linked wallet, whatever order they were added in", async () => {
    const db = await testDb();
    const userId = await person(db, "did:privy:p");
    await db.insert(wallets).values({ userId, address: "PhantomFirst", kind: "external", isPrimary: false });
    const mercury = await mercuryWallet(db, userId);
    await db.insert(wallets).values({ userId, address: "PhantomAfter", kind: "external", isPrimary: false });

    const [row] = await db.insert(activities).values(feedRow(userId)).returning();

    expect(row!.walletId).toBe(mercury);
  });

  it("files each person's rows under their own wallet, in one insert", async () => {
    const db = await testDb();
    const a = await person(db, "did:privy:a");
    const b = await person(db, "did:privy:b");
    const walletA = await mercuryWallet(db, a);
    const walletB = await mercuryWallet(db, b);

    await db.insert(activities).values([feedRow(a), feedRow(b)]);

    const rowsA = await db.select().from(activities).where(eq(activities.userId, a));
    const rowsB = await db.select().from(activities).where(eq(activities.userId, b));
    expect(rowsA.map((r) => r.walletId)).toEqual([walletA]);
    expect(rowsB.map((r) => r.walletId)).toEqual([walletB]);
  });

  it("refuses the write for someone with no Mercury wallet, rather than filing it nowhere", async () => {
    const db = await testDb();
    const userId = await person(db, "did:privy:nowallet");
    await db.insert(wallets).values({ userId, address: "OnlyLinked", kind: "external", isPrimary: false });

    await expect(db.insert(activities).values(feedRow(userId))).rejects.toThrow();
  });
});
