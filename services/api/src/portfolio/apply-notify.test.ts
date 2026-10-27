import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { activities, instruments, notifications, tokens, users } from "../db/schema.js";
import { applyReconciliation } from "./apply.js";
import type { Reconciliation } from "./reconcile.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NOW = new Date("2026-10-27T12:00:00.000Z");

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:div" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  return { db, userId: user!.id, instrumentId: instrument!.id, tokenId: token!.id };
};

/** A pass that found a dividend: one free lot, and the feed row that says so. */
const dividendPlan = (tokenId: string, instrumentId: string): Reconciliation => ({
  lots: [
    {
      tokenId,
      instrumentId,
      tokenQty: 0n,
      shares: D("0.004"),
      unitCostUsd: D(0),
      source: "dividend",
      isEstimated: false,
      acquiredAt: NOW,
    },
  ],
  activity: [
    {
      kind: "dividend",
      title: "NVDA dividend",
      subtitle: "Paid as 0.004 shares",
      amountUsd: D("0.72"),
      refTable: "token",
      refId: tokenId,
      occurredAt: NOW,
    },
  ],
  disposals: [],
  retracted: [],
  positions: [],
});

describe("applyReconciliation and the inbox", () => {
  it("tells the holder about a dividend", async () => {
    const { db, userId, tokenId, instrumentId } = await seed();
    await applyReconciliation(db, userId, dividendPlan(tokenId, instrumentId));

    const [row] = await db.select().from(activities);
    const told = await db.select().from(notifications);
    expect(told).toHaveLength(1);
    expect(told[0]!.kind).toBe("dividend");
    expect(told[0]!.activityId).toBe(row!.id);
    expect(told[0]!.userId).toBe(userId);
  });
});
