import { describe, expect, it } from "vitest";
import { mercuryWallet, testDb } from "../db/testing.js";
import { users, wallets } from "../db/schema.js";
import { DORMANT_IDLE_MS, linkedViewings, RECENT_IDLE_MS, VIEWED_WITHIN_MS, viewedTiers } from "./tiers.js";

const NOW = Date.parse("2026-11-21T10:00:00.000Z");

describe("viewedTiers", () => {
  const tiers = () => {
    const t = viewedTiers({ now: () => NOW });
    t.load([
      { address: "Recent", lastViewedAt: new Date(NOW - VIEWED_WITHIN_MS + 60_000) },
      { address: "Dormant", lastViewedAt: new Date(NOW - VIEWED_WITHIN_MS) },
      { address: "Never", lastViewedAt: null },
    ]);
    return t;
  };

  it("reads a linked wallet viewed this week every five minutes", () => {
    expect(tiers().idleFor("Recent")).toBe(RECENT_IDLE_MS);
    expect(RECENT_IDLE_MS).toBe(5 * 60_000);
  });

  it("reads one nobody has looked at for a week, or ever, hourly", () => {
    expect(tiers().idleFor("Dormant")).toBe(DORMANT_IDLE_MS);
    expect(tiers().idleFor("Never")).toBe(DORMANT_IDLE_MS);
    expect(DORMANT_IDLE_MS).toBe(60 * 60_000);
  });

  it("has nothing to say about a wallet that is not linked, which keeps its job's cadence", () => {
    expect(tiers().idleFor("MercuryWallet")).toBeUndefined();
  });

  it("forgets a wallet that is no longer in what it was given", () => {
    const t = tiers();
    t.load([]);
    expect(t.idleFor("Recent")).toBeUndefined();
  });
});

describe("linkedViewings", () => {
  it("lists followed linked wallets with when each was last viewed, and nothing else", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:t" }).returning();
    await mercuryWallet(db, user!.id, "Mercury");
    const viewed = new Date(NOW);
    await db.insert(wallets).values([
      { userId: user!.id, address: "Looked", kind: "external", isPrimary: false, lastViewedAt: viewed },
      { userId: user!.id, address: "Unseen", kind: "external", isPrimary: false },
      { userId: user!.id, address: "Gone", kind: "external", isPrimary: false, unlinkedAt: viewed },
    ]);

    const rows = await linkedViewings(db);

    expect([...rows].sort((a, b) => a.address.localeCompare(b.address))).toEqual([
      { address: "Looked", lastViewedAt: viewed },
      { address: "Unseen", lastViewedAt: null },
    ]);
  });
});
