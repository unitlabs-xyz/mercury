import { describe, expect, it } from "vitest";

import { mercuryWallet, testDb } from "../db/testing.js";
import { users, portfolioSnapshots, wallets } from "../db/schema.js";
import { readLatestDebt, readSnapshots } from "./queries.js";

/**
 * Debt is money, so it is stored the way every other figure here is stored, and
 * it has to come back out as what went in. The stale fallback reads it when
 * Kamino cannot be reached, which is exactly when nobody is checking it.
 */
describe("debt on a snapshot", () => {
  it("round-trips through numeric(38,18) to the cent", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d1" }).returning();
    const walletId = await mercuryWallet(db, user!.id);
    await db.insert(portfolioSnapshots).values({
      userId: user!.id,
      walletId,
      capturedAt: new Date("2026-09-30T12:00:00.000Z"),
      totalUsd: "10000.005",
      stocksUsd: "15000.005",
      cashUsd: "0",
      debtUsd: "5000.000000000000000001",
    });
    const debt = await readLatestDebt(db, { userId: user!.id, walletId });
    expect(debt?.toFixed()).toBe("5000.000000000000000001");
  });

  it("defaults to zero, so a row written before this column is not a loan", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d2" }).returning();
    const walletId = await mercuryWallet(db, user!.id);
    await db.insert(portfolioSnapshots).values({
      userId: user!.id,
      walletId,
      capturedAt: new Date("2026-09-30T12:00:00.000Z"),
      totalUsd: "100",
      stocksUsd: "100",
      cashUsd: "0",
    });
    expect((await readLatestDebt(db, { userId: user!.id, walletId }))?.toFixed()).toBe("0");
  });

  it("reads the newest reading, not the first one it finds", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d3" }).returning();
    const walletId = await mercuryWallet(db, user!.id);
    for (const [hour, debt] of [
      ["10:00", "100"],
      ["12:00", "300"],
      ["11:00", "200"],
    ] as const) {
      await db.insert(portfolioSnapshots).values({
        userId: user!.id,
        walletId,
        capturedAt: new Date(`2026-09-30T${hour}:00.000Z`),
        totalUsd: "1000",
        stocksUsd: "1000",
        cashUsd: "0",
        debtUsd: debt,
      });
    }
    expect((await readLatestDebt(db, { userId: user!.id, walletId }))?.toFixed()).toBe("300");
  });

  it("is null for an account that has never been snapshotted", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d4" }).returning();
    const walletId = await mercuryWallet(db, user!.id);
    expect(await readLatestDebt(db, { userId: user!.id, walletId })).toBeNull();
  });
});

describe("readSnapshots and readLatestDebt, wallet by wallet", () => {
  const hour = (h: number) => new Date(`2026-11-20T${String(h).padStart(2, "0")}:00:00.000Z`);

  const seed = async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:sum" }).returning();
    const userId = user!.id;
    const mercury = await mercuryWallet(db, userId);
    const [linked] = await db
      .insert(wallets)
      .values({ userId, address: "Linked", kind: "external", isPrimary: false, linkedAt: hour(11) })
      .returning();
    const reading = (walletId: string, h: number, totalUsd: string, debtUsd = "0") => ({
      userId,
      walletId,
      capturedAt: hour(h),
      readAt: new Date(hour(h).getTime() + h * 60_000),
      totalUsd,
      stocksUsd: totalUsd,
      cashUsd: "0",
      debtUsd,
    });
    // The Mercury wallet from 10:00; the linked wallet from 11:00, when it was
    // linked, and missing 13:00.
    await db
      .insert(portfolioSnapshots)
      .values([
        reading(mercury, 10, "100"),
        reading(mercury, 11, "110"),
        reading(mercury, 12, "120"),
        reading(mercury, 13, "130"),
        reading(linked!.id, 11, "1000", "40"),
        reading(linked!.id, 12, "1001.5", "50"),
      ]);
    return { db, userId, mercury, linked: linked!.id };
  };

  it("charts one wallet as its own readings", async () => {
    const s = await seed();
    const rows = await readSnapshots(s.db, s.userId, [s.mercury], hour(0));
    expect(rows.map((r) => r.totalUsd.toFixed())).toEqual(["100", "110", "120", "130"]);
  });

  it("adds wallets up hour by hour, drawing only the hours every wallet has a reading for", async () => {
    const s = await seed();
    const rows = await readSnapshots(s.db, s.userId, [s.mercury, s.linked], hour(0));
    // 10:00 is before the link and 13:00 is the linked wallet's missed hour;
    // counting either would chart $1,000 arriving or leaving.
    expect(rows.map((r) => [r.at.toISOString(), r.totalUsd.toFixed()])).toEqual([
      [hour(11).toISOString(), "1110"],
      [hour(12).toISOString(), "1121.5"],
    ]);
    // Read as late as the later of the two.
    expect(rows[0]!.readAt).toEqual(new Date(hour(11).getTime() + 11 * 60_000));
  });

  it("charts nothing for no wallets", async () => {
    const s = await seed();
    expect(await readSnapshots(s.db, s.userId, [], hour(0))).toEqual([]);
  });

  it("falls back to each wallet's own last debt, not the account's", async () => {
    const s = await seed();
    expect((await readLatestDebt(s.db, { userId: s.userId, walletId: s.linked }))?.toFixed()).toBe("50");
    expect((await readLatestDebt(s.db, { userId: s.userId, walletId: s.mercury }))?.toFixed()).toBe("0");
  });
});
