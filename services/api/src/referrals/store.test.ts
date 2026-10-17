import { describe, expect, it } from "vitest";
import { referrals } from "../db/schema.js";
import { testDb } from "../db/testing.js";
import { createReferralStore } from "./store.js";
import { seedInstrument, seedOrder, seedUsdcIn, seedUser, seedWaitlist } from "./testing.js";

describe("codeFor", () => {
  it("makes a code once and keeps it", async () => {
    const db = await testDb();
    const ada = await seedUser(db, 1);
    const store = createReferralStore(db);
    const first = await store.codeFor(ada.id);
    expect(first).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    expect(await store.codeFor(ada.id)).toBe(first);
  });

  /* Their founding card's link said ?ref=<slug>; it should still mean them. */
  it("gives a waitlist member their card's slug, whatever case Privy sends the email in", async () => {
    const db = await testDb();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 12 });
    const ada = await seedUser(db, 1, { email: "Ada@Example.com" });
    expect(await createReferralStore(db).codeFor(ada.id)).toBe("3kQ9xZ1bTq7w");
  });

  it("gives two people two codes", async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const [a, b] = [await seedUser(db, 1), await seedUser(db, 2)];
    expect(await store.codeFor(a.id)).not.toBe(await store.codeFor(b.id));
  });
});

describe("isFounding", () => {
  it("is the first 500 on the waitlist", async () => {
    const db = await testDb();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 500 });
    await seedWaitlist(db, { email: "bo@example.com", slug: "Zz9xZ1bTq7wQ", position: 501 });
    const store = createReferralStore(db);
    expect(await store.isFounding((await seedUser(db, 1, { email: "ada@example.com" })).id)).toBe(true);
    expect(await store.isFounding((await seedUser(db, 2, { email: "bo@example.com" })).id)).toBe(false);
    expect(await store.isFounding((await seedUser(db, 3)).id)).toBe(false);
  });
});

describe("claim", () => {
  const DAY = 86_400_000;
  const now = new Date("2026-10-17T12:00:00Z");
  const setup = async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const inviter = await seedUser(db, 1, { referralCode: "inviter1" });
    const friend = await seedUser(db, 2, { createdAt: new Date(now.getTime() - DAY) });
    return { db, store, inviter, friend };
  };

  it("records the inviter once", async () => {
    const { store, inviter, friend } = await setup();
    expect(await store.claim(friend.id, "inviter1", now)).toEqual({ kind: "claimed", inviterId: inviter.id });
    expect(await store.referredAt(friend.id)).toEqual(now);
  });

  /* The web retries a claim it never heard back from; the second answer must not be an error. */
  it("answers a repeat of the same claim calmly", async () => {
    const { store, inviter, friend } = await setup();
    await store.claim(friend.id, "inviter1", now);
    expect(await store.claim(friend.id, "inviter1", now)).toEqual({ kind: "already", inviterId: inviter.id });
  });

  it("keeps the first inviter when a second code arrives", async () => {
    const { db, store, friend } = await setup();
    await seedUser(db, 3, { referralCode: "inviter2" });
    await store.claim(friend.id, "inviter1", now);
    expect(await store.claim(friend.id, "inviter2", now)).toEqual({ kind: "taken" });
  });

  it("refuses your own code", async () => {
    const { store, inviter } = await setup();
    expect(await store.claim(inviter.id, "inviter1", now)).toEqual({ kind: "self" });
  });

  it("does not know a code nobody holds", async () => {
    const { store, friend } = await setup();
    expect(await store.claim(friend.id, "nobody00", now)).toEqual({ kind: "unknown_code" });
  });

  it("is too late for an account more than a week old", async () => {
    const { db, store } = await setup();
    const old = await seedUser(db, 4, { createdAt: new Date(now.getTime() - 8 * DAY) });
    expect(await store.claim(old.id, "inviter1", now)).toEqual({ kind: "too_late" });
  });

  it("is too late for someone who has already traded", async () => {
    const { db, store, friend } = await setup();
    const nvda = await seedInstrument(db);
    await seedOrder(db, { userId: friend.id, instrumentId: nvda.id, side: "buy", status: "filled" });
    expect(await store.claim(friend.id, "inviter1", now)).toEqual({ kind: "too_late" });
  });

  it("says nobody referred a person nobody referred", async () => {
    const { store, friend } = await setup();
    expect(await store.referredAt(friend.id)).toBeNull();
  });

  /* Their card's link said ?ref=<slug> before they ever opened the Invite panel; it still means them. */
  it("finds a waitlist member by their card's slug before they have a code", async () => {
    const { db, store, friend } = await setup();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 12 });
    const ada = await seedUser(db, 5, { email: "Ada@Example.com" });
    expect(await store.claim(friend.id, "3kQ9xZ1bTq7w", now)).toEqual({ kind: "claimed", inviterId: ada.id });
    expect(await store.codeFor(ada.id)).toBe("3kQ9xZ1bTq7w");
  });
});

describe("qualifyPending", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const setup = async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const inviter = await seedUser(db, 1, { referralCode: "inviter1" });
    const friend = await seedUser(db, 2);
    await store.claim(friend.id, "inviter1", now);
    const nvda = await seedInstrument(db);
    const trade = () =>
      seedOrder(db, { userId: friend.id, instrumentId: nvda.id, side: "buy", status: "filled" });
    const qualifiedAt = async () => (await db.select().from(referrals))[0]!.qualifiedAt;
    return { db, store, inviter, friend, trade, qualifiedAt };
  };

  it("counts a friend once they have put in $50 and traded", async () => {
    const { db, store, friend, trade, qualifiedAt } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "30", signature: "sig-1" });
    await seedUsdcIn(db, { userId: friend.id, usd: "20", signature: "sig-2" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(1);
    expect(await qualifiedAt()).toEqual(now);
  });

  it("waits for the trade", async () => {
    const { db, store, friend } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "500", signature: "sig-1" });
    expect(await store.qualifyPending(now)).toBe(0);
  });

  it("waits for the full $50", async () => {
    const { db, store, friend, trade } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "49.99", signature: "sig-1" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(0);
  });

  /* Otherwise $50 passed around a ring of accounts would buy a tier. */
  it("does not count money the inviter sent them", async () => {
    const { db, store, inviter, friend, trade } = await setup();
    await seedUsdcIn(db, { userId: inviter.id, usd: "50", signature: "sig-gift", kind: "transfer_out" });
    await seedUsdcIn(db, { userId: friend.id, usd: "50", signature: "sig-gift" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(0);
  });

  it("does not count a referral payout as funding", async () => {
    const { db, store, friend, trade } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "50", signature: "sig-1", refTable: "referral_payout" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(0);
  });

  it("dates a friend from the first pass that counted them, not the latest", async () => {
    const { db, store, friend, trade, qualifiedAt } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "50", signature: "sig-1" });
    await trade();
    await store.qualifyPending(now);
    expect(await store.qualifyPending(new Date(now.getTime() + 60_000))).toBe(0);
    expect(await qualifiedAt()).toEqual(now);
  });
});
