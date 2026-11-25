import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import type { MintConfig } from "@mercury/chain";
import { mercuryWallet, testDb } from "../db/testing.js";
import {
  activities,
  disposals,
  instruments,
  lots,
  multiplierAnnouncements,
  notifications,
  tokens,
  users,
  wallets,
} from "../db/schema.js";
import { watchMultiplierAnnouncements } from "./announcements.js";

const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const NOW = new Date("2026-11-25T12:00:00.000Z");
const EFFECTIVE = new Date("2026-12-03T00:00:00.000Z");
const whole = (n: number) => BigInt(n) * 100_000_000n;

const seed = async () => {
  const db = await testDb();
  const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: TSLAX, symbol: "TSLAx", issuer: "backed", decimals: 8 })
    .returning();
  const holder = async (did: string, held: bigint, sold = 0n) => {
    const [user] = await db.insert(users).values({ privyUserId: did }).returning();
    const walletId = await mercuryWallet(db, user!.id);
    const base = { userId: user!.id, walletId, tokenId: token!.id, instrumentId: instrument!.id };
    await db.insert(lots).values({
      ...base,
      tokenQty: held,
      shares: "1",
      unitCostUsd: "200",
      feeUsd: "0",
      acquiredAt: NOW,
      source: "buy",
    });
    if (sold > 0n) {
      await db
        .insert(disposals)
        .values({ ...base, tokenQty: sold, shares: "1", kind: "sell", occurredAt: NOW });
    }
    return { userId: user!.id, walletId };
  };
  return { db, tokenId: token!.id, holder };
};

/** A chain whose TSLAx mint has `scheduled` written to it, ahead or not. */
const chainWith = (scheduled: MintConfig["scheduled"]) => ({
  mintConfig: async () => null,
  mintConfigs: async () =>
    new Map<string, MintConfig>([
      [TSLAX, { decimals: 8, multiplier: D("1.0"), isPaused: false, ...(scheduled ? { scheduled } : {}) }],
    ]),
});

describe("watchMultiplierAnnouncements", () => {
  it("tells each wallet holding the token, once, in the feed and the inbox, before the dividend lands", async () => {
    const s = await seed();
    const a = await s.holder("did:privy:a", whole(10));
    // Bought 4 and sold them all: holds none, so is told nothing.
    await s.holder("did:privy:b", whole(4), whole(4));
    const chain = chainWith({ multiplier: D("1.00085"), effectiveAt: EFFECTIVE });

    expect(await watchMultiplierAnnouncements(s.db, { chain }, NOW)).toEqual({ announced: 1, told: 1 });
    const feed = await s.db.select().from(activities);
    expect(feed.map((r) => [r.walletId, r.kind, r.title, r.subtitle, r.amountUsd])).toEqual([
      [
        a.walletId,
        "dividend_notice",
        "TSLA dividend coming",
        "On Dec 3, 2026, paid as shares: about 0.0085 more on your 10",
        null,
      ],
    ]);
    const told = await s.db.select().from(notifications);
    expect(told.map((n) => [n.userId, n.kind, n.activityId])).toEqual([[a.userId, "dividend", feed[0]!.id]]);

    // The next hour's pass finds the same change, and says nothing again.
    expect(await watchMultiplierAnnouncements(s.db, { chain }, NOW)).toEqual({ announced: 0, told: 0 });
    expect(await s.db.select().from(notifications)).toHaveLength(1);
    const [row] = await s.db
      .select()
      .from(multiplierAnnouncements)
      .where(eq(multiplierAnnouncements.tokenId, s.tokenId));
    expect([row!.kind, row!.effectiveAt]).toEqual(["dividend", EFFECTIVE]);
  });

  it("tells a split as a split: more shares, each worth less, nothing earned", async () => {
    const s = await seed();
    await s.holder("did:privy:a", whole(10));
    await watchMultiplierAnnouncements(
      s.db,
      { chain: chainWith({ multiplier: D("3"), effectiveAt: EFFECTIVE }) },
      NOW,
    );
    const [row] = await s.db.select().from(activities);
    expect([row!.title, row!.subtitle]).toEqual([
      "TSLA stock split coming",
      "On Dec 3, 2026, each share becomes 3: your 10 become about 30",
    ]);
  });

  it("says nothing with no change ahead, or one it can't name", async () => {
    const s = await seed();
    await s.holder("did:privy:a", whole(10));
    expect(await watchMultiplierAnnouncements(s.db, { chain: chainWith(undefined) }, NOW)).toEqual({
      announced: 0,
      told: 0,
    });
    // A fall: nothing here can say what it is.
    expect(
      await watchMultiplierAnnouncements(
        s.db,
        { chain: chainWith({ multiplier: D("0.9"), effectiveAt: EFFECTIVE }) },
        NOW,
      ),
    ).toEqual({ announced: 0, told: 0 });
    expect(await s.db.select().from(activities)).toEqual([]);
  });

  it("leaves an unlinked wallet out", async () => {
    const s = await seed();
    const a = await s.holder("did:privy:a", whole(10));
    await s.db.update(wallets).set({ unlinkedAt: NOW }).where(eq(wallets.id, a.walletId));
    expect(
      await watchMultiplierAnnouncements(
        s.db,
        { chain: chainWith({ multiplier: D("1.00085"), effectiveAt: EFFECTIVE }) },
        NOW,
      ),
    ).toEqual({ announced: 1, told: 0 });
  });
});
