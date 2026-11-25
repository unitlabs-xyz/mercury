import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT } from "@mercury/chain";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, users, wallets } from "../db/schema.js";
import { hasEarnHistory, pgEarnLedger, type EarnRecord } from "./store.js";

const setup = async () => {
  const db = await testDb();
  const [user] = await db
    .insert(users)
    .values({ privyUserId: "did:privy:e", email: "e@example.com" })
    .returning();
  const walletId = await mercuryWallet(db, user!.id, "WaLLeT");
  return { db, ledger: pgEarnLedger(db), userId: user!.id, owner: { userId: user!.id, walletId } };
};

const move = (owner: { userId: string; walletId: string }, over: Partial<EarnRecord> = {}): EarnRecord => ({
  userId: owner.userId,
  walletId: owner.walletId,
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
    const { db, ledger, owner } = await setup();
    expect(await ledger.record(move(owner))).toBe(true);
    expect(await ledger.record(move(owner))).toBe(false);
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
    expect((await ledger.netDeposited(owner)).get("Vault")?.toString()).toBe("20");
  });

  it("names a withdrawal as one, and nets it off what went in", async () => {
    const { db, ledger, owner } = await setup();
    await ledger.record(move(owner));
    await ledger.record(move(owner, { kind: "withdraw", usdc: D("5"), signature: "sig-2" }));
    const feed = await db.select({ kind: activities.kind, title: activities.title }).from(activities);
    expect(feed).toContainEqual({ kind: "earn_withdraw", title: "Withdrew from Earn" });
    expect((await ledger.netDeposited(owner)).get("Vault")?.toString()).toBe("15");
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

describe("hasEarnHistory", () => {
  it("is true only for a wallet whose account has moved money through Earn", async () => {
    const { db, ledger, owner } = await setup();
    expect(await hasEarnHistory(db, "WaLLeT")).toBe(false);
    await ledger.record(move(owner));
    expect(await hasEarnHistory(db, "WaLLeT")).toBe(true);
    expect(await hasEarnHistory(db, "SomeoneElse")).toBe(false);
  });

  it("is false for the person's other wallets, which have moved nothing through Earn themselves", async () => {
    const { db, ledger, userId, owner } = await setup();
    await ledger.record(move(owner));
    await db
      .insert(wallets)
      .values({ userId, address: "Linked", kind: "external", isPrimary: false, linkedAt: new Date() });
    expect(await hasEarnHistory(db, "WaLLeT")).toBe(true);
    expect(await hasEarnHistory(db, "Linked")).toBe(false);
  });
});

describe("pgEarnLedger.netDeposited, wallet by wallet", () => {
  it("nets only the wallet asked about", async () => {
    const { db, ledger, userId, owner } = await setup();
    await ledger.record(move(owner));
    const [linked] = await db
      .insert(wallets)
      .values({ userId, address: "Linked", kind: "external", isPrimary: false, linkedAt: new Date() })
      .returning();
    expect((await ledger.netDeposited(owner)).get("Vault")?.toString()).toBe("20");
    expect((await ledger.netDeposited({ userId, walletId: linked!.id })).size).toBe(0);
  });
});
