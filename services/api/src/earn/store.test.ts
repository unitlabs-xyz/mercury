import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, users } from "../db/schema.js";
import { pgEarnLedger, type EarnRecord } from "./store.js";

const setup = async () => {
  const db = await testDb();
  const [user] = await db
    .insert(users)
    .values({ privyUserId: "did:privy:e", email: "e@example.com" })
    .returning();
  return { db, ledger: pgEarnLedger(db), userId: user!.id };
};

const move = (userId: string, over: Partial<EarnRecord> = {}): EarnRecord => ({
  userId,
  kind: "deposit",
  usdc: D("20"),
  vault: "Vault",
  vaultName: "Steakhouse USDC",
  signature: "sig-1",
  occurredAt: new Date("2026-10-22T10:00:00Z"),
  ...over,
});

describe("pgEarnLedger.record", () => {
  /* Moves into and out of Earn used to leave no line in Activity: the cash just dropped. */
  it("files a move once, with a row in the feed beside it", async () => {
    const { db, ledger, userId } = await setup();
    expect(await ledger.record(move(userId))).toBe(true);
    expect(await ledger.record(move(userId))).toBe(false);
    const feed = await db.select().from(activities);
    expect(
      feed.map((r) => [
        r.kind,
        r.title,
        r.subtitle,
        D(r.amountUsd!).toString(),
        r.mint,
        r.txSignature,
        r.refTable,
      ]),
    ).toEqual([["earn_deposit", "Moved to Earn", "Steakhouse USDC", "20", USDC_MINT, "sig-1", "earn_event"]]);
    expect((await ledger.netDeposited(userId)).get("Vault")?.toString()).toBe("20");
  });

  it("names a withdrawal as one, and nets it off what went in", async () => {
    const { db, ledger, userId } = await setup();
    await ledger.record(move(userId));
    await ledger.record(move(userId, { kind: "withdraw", usdc: D("5"), signature: "sig-2" }));
    const feed = await db.select({ kind: activities.kind, title: activities.title }).from(activities);
    expect(feed).toContainEqual({ kind: "earn_withdraw", title: "Withdrew from Earn" });
    expect((await ledger.netDeposited(userId)).get("Vault")?.toString()).toBe("15");
  });
});

describe("pgEarnLedger settings", () => {
  it("keeps which wording of Earn's risks was accepted", async () => {
    const { ledger, userId } = await setup();
    expect((await ledger.settings(userId)).riskAccepted).toBeNull();
    await ledger.save(userId, { riskAccepted: "2026-10-22" });
    expect(await ledger.settings(userId)).toEqual({ vault: null, riskAccepted: "2026-10-22" });
    await ledger.save(userId, { vault: "Vault" });
    expect(await ledger.settings(userId)).toEqual({ vault: "Vault", riskAccepted: "2026-10-22" });
  });
});
