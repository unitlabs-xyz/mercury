import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { users, portfolioSnapshots } from "../db/schema.js";
import { readLatestDebt } from "./queries.js";

/**
 * Debt is money, so it is stored the way every other figure here is stored, and
 * it has to come back out as what went in. The stale fallback reads it when
 * Kamino cannot be reached, which is exactly when nobody is checking it.
 */
describe("debt on a snapshot", () => {
  it("round-trips through numeric(38,18) to the cent", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d1" }).returning();
    await db.insert(portfolioSnapshots).values({
      userId: user!.id,
      capturedAt: new Date("2026-09-30T12:00:00.000Z"),
      totalUsd: "10000.005",
      stocksUsd: "15000.005",
      cashUsd: "0",
      debtUsd: "5000.000000000000000001",
    });
    const debt = await readLatestDebt(db, user!.id);
    expect(debt?.toFixed()).toBe("5000.000000000000000001");
  });

  it("defaults to zero, so a row written before this column is not a loan", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d2" }).returning();
    await db.insert(portfolioSnapshots).values({
      userId: user!.id,
      capturedAt: new Date("2026-09-30T12:00:00.000Z"),
      totalUsd: "100",
      stocksUsd: "100",
      cashUsd: "0",
    });
    expect((await readLatestDebt(db, user!.id))?.toFixed()).toBe("0");
  });

  it("reads the newest reading, not the first one it finds", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d3" }).returning();
    for (const [hour, debt] of [["10:00", "100"], ["12:00", "300"], ["11:00", "200"]] as const) {
      await db.insert(portfolioSnapshots).values({
        userId: user!.id,
        capturedAt: new Date(`2026-09-30T${hour}:00.000Z`),
        totalUsd: "1000",
        stocksUsd: "1000",
        cashUsd: "0",
        debtUsd: debt,
      });
    }
    expect((await readLatestDebt(db, user!.id))?.toFixed()).toBe("300");
  });

  it("is null for an account that has never been snapshotted", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:d4" }).returning();
    expect(await readLatestDebt(db, user!.id)).toBeNull();
  });
});
