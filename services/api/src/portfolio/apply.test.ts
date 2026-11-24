import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import { disposals, historyJobs, instruments, tokens, users, wallets } from "../db/schema.js";
import { applyReconciliation } from "./apply.js";
import type { Reconciliation } from "./reconcile.js";

/**
 * Who writes a wallet's departures. Position-sync sees balances; for a linked
 * wallet whose past is costed, the history reader sees each transaction in
 * order, and its departures are the ones that count.
 */
describe("applyReconciliation, a balance below the records", () => {
  const seed = async (status: "read" | "done" | null) => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:apply" }).returning();
    const userId = user!.id;
    const mercury = await mercuryWallet(db, userId);
    const [w] = await db
      .insert(wallets)
      .values({ userId, address: "Phantom1", kind: "external", isPrimary: false, linkedAt: new Date() })
      .returning();
    if (status !== null) await db.insert(historyJobs).values({ walletId: w!.id, userId, status });
    const [i] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
    const [t] = await db
      .insert(tokens)
      .values({ instrumentId: i!.id, mint: "TSLAx", symbol: "TSLAx", issuer: "backed", decimals: 8 })
      .returning();
    const plan: Reconciliation = {
      lots: [],
      activity: [],
      retracted: [],
      positions: [],
      disposals: [
        {
          tokenId: t!.id,
          instrumentId: i!.id,
          tokenQty: 100_000_000n,
          shares: D(1),
          kind: "transfer_out",
          occurredAt: new Date(),
        },
      ],
    };
    const gone = async (walletId: string) =>
      (await db.select().from(disposals).where(eq(disposals.walletId, walletId))).length;
    return { db, userId, linked: w!.id, mercury, plan, gone };
  };

  it("leaves a costed linked wallet's departures to the history reader", async () => {
    const s = await seed("done");
    await applyReconciliation(s.db, { userId: s.userId, walletId: s.linked }, s.plan);
    expect(await s.gone(s.linked)).toBe(0);
  });

  it("writes them for the Mercury wallet, whose every trade Mercury records", async () => {
    const s = await seed("done");
    await applyReconciliation(s.db, { userId: s.userId, walletId: s.mercury }, s.plan);
    expect(await s.gone(s.mercury)).toBe(1);
  });

  it("writes them for a linked wallet whose past is not costed yet", async () => {
    const s = await seed("read");
    await applyReconciliation(s.db, { userId: s.userId, walletId: s.linked }, s.plan);
    expect(await s.gone(s.linked)).toBe(1);
  });
});
