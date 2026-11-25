import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mercuryWallet, testDb } from "../db/testing.js";
import type { Db } from "../db/client.js";
import {
  activities,
  historyJobs,
  loanAlerts,
  walletStreams,
  orders,
  instruments,
  users,
  walletLinkChallenges,
  wallets,
} from "../db/schema.js";
import { CHALLENGE_TTL_MS } from "./message.js";
import {
  CHALLENGES_PER_WINDOW,
  completeLink,
  keptWallets,
  listWallets,
  openChallenge,
  pruneLinkChallenges,
  renameWallet,
  unlinkWallet,
} from "./store.js";
import { testWallet } from "./testing.js";
import { verifyWalletSignature } from "./verify.js";

const APP = "https://beta.trymercury.xyz";
const LIMIT = 5;
const NOW = new Date("2026-11-21T10:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

const person = async (db: Db, privyUserId: string) => {
  const [user] = await db.insert(users).values({ privyUserId }).returning();
  const mercury = await mercuryWallet(db, user!.id, `Mercury-${privyUserId}`);
  return { userId: user!.id, mercury };
};

/** Asks for a challenge, signs it with `wallet`, and sends the signature back. */
const linkWith = async (
  db: Db,
  userId: string,
  wallet: Awaited<ReturnType<typeof testWallet>>,
  opts: { now?: Date; limit?: number } = {},
) => {
  const now = opts.now ?? NOW;
  const limit = opts.limit ?? LIMIT;
  const opened = await openChallenge(db, { userId, address: wallet.address, appUrl: APP, limit, now });
  if (opened.kind !== "ok") return opened;
  return completeLink(db, {
    userId,
    challengeId: opened.challengeId,
    signature: await wallet.sign(opened.message),
    limit,
    now,
    verify: verifyWalletSignature,
  });
};

const linked = async (db: Db, userId: string, now = NOW) => {
  const wallet = await testWallet();
  const result = await linkWith(db, userId, wallet, { now });
  if (result.kind !== "linked") throw new Error(`expected a link, got ${JSON.stringify(result)}`);
  return { ...wallet, id: result.wallet.id };
};

describe("openChallenge", () => {
  it("issues a message naming the app and the wallet, good for ten minutes, and keeps it", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();

    const opened = await openChallenge(db, {
      userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });

    expect(opened.kind).toBe("ok");
    if (opened.kind !== "ok") return;
    expect(opened.message.split("\n").slice(0, 2)).toEqual([
      "beta.trymercury.xyz wants you to link this wallet to your Mercury account:",
      phantom.address,
    ]);
    expect(opened.expiresAt).toEqual(later(CHALLENGE_TTL_MS));
    const [stored] = await db.select().from(walletLinkChallenges);
    expect(stored).toMatchObject({ id: opened.challengeId, userId, address: phantom.address, usedAt: null });
    expect(stored!.message).toBe(opened.message);
  });

  it("opens no more than its ceiling of challenges in ten minutes, and opens again after", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();
    const ask = (now: Date) =>
      openChallenge(db, { userId, address: phantom.address, appUrl: APP, limit: LIMIT, now });
    for (let i = 0; i < CHALLENGES_PER_WINDOW; i++) expect((await ask(later(i))).kind).toBe("ok");
    expect(await ask(later(CHALLENGES_PER_WINDOW))).toEqual({
      kind: "refused",
      reason: "too_many_challenges",
    });
    // Someone else is not held up by it.
    const other = await person(db, "did:privy:b");
    expect(
      (
        await openChallenge(db, {
          userId: other.userId,
          address: phantom.address,
          appUrl: APP,
          limit: LIMIT,
          now: NOW,
        })
      ).kind,
    ).toBe("ok");
    expect((await ask(later(CHALLENGE_TTL_MS + CHALLENGES_PER_WINDOW))).kind).toBe("ok");
  });

  it("refuses before anything is signed when the person is at the limit", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    for (let i = 0; i < LIMIT; i++) await linked(db, userId);

    const phantom = await testWallet();
    expect(
      await openChallenge(db, { userId, address: phantom.address, appUrl: APP, limit: LIMIT, now: NOW }),
    ).toEqual({ kind: "refused", reason: "link_limit" });
  });

  it("does not count the Mercury wallet, or a wallet that was unlinked, toward the limit", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const first = await linked(db, userId);
    for (let i = 1; i < LIMIT; i++) await linked(db, userId);
    await unlinkWallet(db, { userId, walletId: first.id, deleteHistory: false, now: NOW });

    const phantom = await testWallet();
    const opened = await openChallenge(db, {
      userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    expect(opened.kind).toBe("ok");
  });

  it("refuses a wallet that is already the person's, the Mercury wallet included", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);

    for (const address of [phantom.address, "Mercury-did:privy:a"]) {
      expect(await openChallenge(db, { userId, address, appUrl: APP, limit: LIMIT, now: NOW })).toEqual({
        kind: "refused",
        reason: "already_linked",
      });
    }
  });

  it("opens a challenge for a wallet another account holds, so asking says nothing about who holds it", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const alicesPhantom = await linked(db, alice.userId);

    for (const address of [alicesPhantom.address, "Mercury-did:privy:alice"]) {
      const opened = await openChallenge(db, {
        userId: bob.userId,
        address,
        appUrl: APP,
        limit: LIMIT,
        now: NOW,
      });
      expect(opened.kind).toBe("ok");
    }
  });

  it("opens one for a wallet another account unlinked but kept, and counts it against the ceiling", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const phantom = await linked(db, alice.userId);
    await unlinkWallet(db, { userId: alice.userId, walletId: phantom.id, deleteHistory: false, now: NOW });

    for (let i = 0; i < CHALLENGES_PER_WINDOW; i++) {
      const opened = await openChallenge(db, {
        userId: bob.userId,
        address: phantom.address,
        appUrl: APP,
        limit: LIMIT,
        now: NOW,
      });
      expect(opened.kind).toBe("ok");
    }
    expect(
      await openChallenge(db, {
        userId: bob.userId,
        address: phantom.address,
        appUrl: APP,
        limit: LIMIT,
        now: NOW,
      }),
    ).toEqual({ kind: "refused", reason: "too_many_challenges" });
  });

  it("refuses a wallet another account holds only once its signature has been checked", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const phantom = await testWallet();
    expect((await linkWith(db, alice.userId, phantom)).kind).toBe("linked");
    const opened = await openChallenge(db, {
      userId: bob.userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");

    // Not the wallet's signature: nothing is said about who holds it.
    const stranger = await testWallet();
    expect(
      await completeLink(db, {
        userId: bob.userId,
        challengeId: opened.challengeId,
        signature: await stranger.sign(opened.message),
        limit: LIMIT,
        now: NOW,
        verify: verifyWalletSignature,
      }),
    ).toEqual({ kind: "refused", reason: "bad_signature" });
    // The wallet's own signature proves it is theirs; only then is it refused as held elsewhere.
    expect(
      await completeLink(db, {
        userId: bob.userId,
        challengeId: opened.challengeId,
        signature: await phantom.sign(opened.message),
        limit: LIMIT,
        now: NOW,
        verify: verifyWalletSignature,
      }),
    ).toEqual({ kind: "refused", reason: "linked_elsewhere" });
  });
});

describe("completeLink", () => {
  it("links the wallet that signed, as a linked wallet and never a Mercury one", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();

    const result = await linkWith(db, userId, phantom);

    expect(result).toMatchObject({
      kind: "linked",
      relinked: false,
      wallet: { address: phantom.address, kind: "external", isPrimary: false, label: null, linkedAt: NOW },
    });
    const [row] = await db.select().from(wallets).where(eq(wallets.address, phantom.address));
    expect(row).toMatchObject({ userId, kind: "external", isPrimary: false, unlinkedAt: null });
  });

  it("uses a challenge once, so one signature links once", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();
    const opened = await openChallenge(db, {
      userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");
    const signature = await phantom.sign(opened.message);
    const send = () =>
      completeLink(db, {
        userId,
        challengeId: opened.challengeId,
        signature,
        limit: LIMIT,
        now: NOW,
        verify: verifyWalletSignature,
      });

    expect((await send()).kind).toBe("linked");
    expect(await send()).toEqual({ kind: "refused", reason: "challenge_invalid" });
    const [challenge] = await db.select().from(walletLinkChallenges);
    expect(challenge!.usedAt).toEqual(NOW);
  });

  it("refuses a challenge that has expired", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();
    const opened = await openChallenge(db, {
      userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");

    const result = await completeLink(db, {
      userId,
      challengeId: opened.challengeId,
      signature: await phantom.sign(opened.message),
      limit: LIMIT,
      now: later(CHALLENGE_TTL_MS),
      verify: verifyWalletSignature,
    });

    expect(result).toEqual({ kind: "refused", reason: "challenge_invalid" });
    expect(await db.select().from(wallets).where(eq(wallets.address, phantom.address))).toEqual([]);
  });

  it("refuses someone else's challenge, as if there were none", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const phantom = await testWallet();
    const opened = await openChallenge(db, {
      userId: alice.userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");

    expect(
      await completeLink(db, {
        userId: bob.userId,
        challengeId: opened.challengeId,
        signature: await phantom.sign(opened.message),
        limit: LIMIT,
        now: NOW,
        verify: verifyWalletSignature,
      }),
    ).toEqual({ kind: "refused", reason: "challenge_invalid" });
  });

  it("refuses a signature by any wallet but the one being linked, and leaves the challenge usable", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();
    const impostor = await testWallet();
    const opened = await openChallenge(db, {
      userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");
    const send = async (signature: string) =>
      completeLink(db, {
        userId,
        challengeId: opened.challengeId,
        signature,
        limit: LIMIT,
        now: NOW,
        verify: verifyWalletSignature,
      });

    expect(await send(await impostor.sign(opened.message))).toEqual({
      kind: "refused",
      reason: "bad_signature",
    });
    expect((await send(await phantom.sign(opened.message))).kind).toBe("linked");
  });

  it("checks the signature against the stored message, never one the client chose", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();
    const opened = await openChallenge(db, {
      userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");
    const checked: string[] = [];

    await completeLink(db, {
      userId,
      challengeId: opened.challengeId,
      signature: "anything",
      limit: LIMIT,
      now: NOW,
      verify: async (address, message) => {
        checked.push(`${address}|${message}`);
        return false;
      },
    });

    expect(checked).toEqual([`${phantom.address}|${opened.message}`]);
  });

  it("holds the limit when signatures for more wallets than it allows arrive together", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const signed = await Promise.all(
      Array.from({ length: LIMIT + 2 }, async () => {
        const wallet = await testWallet();
        const opened = await openChallenge(db, {
          userId,
          address: wallet.address,
          appUrl: APP,
          limit: LIMIT,
          now: NOW,
        });
        if (opened.kind !== "ok") throw new Error("no challenge");
        return { challengeId: opened.challengeId, signature: await wallet.sign(opened.message) };
      }),
    );

    const results = await Promise.all(
      signed.map((s) =>
        completeLink(db, { userId, ...s, limit: LIMIT, now: NOW, verify: verifyWalletSignature }),
      ),
    );

    expect(results.filter((r) => r.kind === "linked")).toHaveLength(LIMIT);
    expect(results.filter((r) => r.kind === "refused" && r.reason === "link_limit")).toHaveLength(2);
    expect((await listWallets(db, userId)).filter((w) => !w.isPrimary)).toHaveLength(LIMIT);
  });

  it("refuses at the last step a wallet another account linked while this one was signing", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const phantom = await testWallet();
    const opened = await openChallenge(db, {
      userId: bob.userId,
      address: phantom.address,
      appUrl: APP,
      limit: LIMIT,
      now: NOW,
    });
    if (opened.kind !== "ok") throw new Error("no challenge");
    expect((await linkWith(db, alice.userId, phantom)).kind).toBe("linked");

    expect(
      await completeLink(db, {
        userId: bob.userId,
        challengeId: opened.challengeId,
        signature: await phantom.sign(opened.message),
        limit: LIMIT,
        now: NOW,
        verify: verifyWalletSignature,
      }),
    ).toEqual({ kind: "refused", reason: "linked_elsewhere" });
  });
});

describe("linking a wallet again", () => {
  it("brings back the same row, with its name and kept history, rather than a second one", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    await renameWallet(db, { userId, walletId: phantom.id, label: "Phantom main" });
    await db
      .insert(activities)
      .values({ userId, walletId: phantom.id, kind: "transfer_in", title: "Added cash" });
    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW });

    const again = await linkWith(db, userId, phantom, { now: later(60_000) });

    expect(again).toMatchObject({
      kind: "linked",
      relinked: true,
      wallet: { id: phantom.id, label: "Phantom main", linkedAt: later(60_000) },
    });
    expect(await db.select().from(wallets).where(eq(wallets.address, phantom.address))).toHaveLength(1);
    expect(await db.select().from(activities).where(eq(activities.walletId, phantom.id))).toHaveLength(1);
  });

  it("queues the linked wallet's past to be read, in the same step as linking it", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    const [job] = await db.select().from(historyJobs).where(eq(historyJobs.walletId, phantom.id));
    expect(job).toMatchObject({ userId, status: "queued", cursors: {}, runAfter: NOW });
  });

  it("queues only the gap when linked again, from the kept cursors, and calculates until it is read", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    await db
      .update(historyJobs)
      .set({ status: "done", cursors: { acct: "SigNewest" } })
      .where(eq(historyJobs.walletId, phantom.id));
    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW });

    await linkWith(db, userId, phantom, { now: later(60_000) });
    const [job] = await db.select().from(historyJobs).where(eq(historyJobs.walletId, phantom.id));
    expect(job).toMatchObject({ status: "queued", cursors: { acct: "SigNewest" }, runAfter: later(60_000) });
  });

  it("starts the live activity job afresh on a wallet linked again, so the gap is not announced as news", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    await db
      .insert(walletStreams)
      .values({ walletId: phantom.id, address: phantom.address, cursor: "SigOld" });
    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW });

    await linkWith(db, userId, phantom, { now: later(60_000) });
    expect(await db.select().from(walletStreams).where(eq(walletStreams.walletId, phantom.id))).toEqual([]);
  });

  it("leaves the live activity job alone on a first link", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const other = await linked(db, userId);
    await db.insert(walletStreams).values({ walletId: other.id, address: other.address, cursor: "SigKept" });
    await linked(db, userId);
    expect(await db.select().from(walletStreams)).toHaveLength(1);
  });

  it("queues no read for a link that was refused", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await testWallet();
    await linkWith(db, userId, phantom, { limit: 0 });
    expect(await db.select().from(historyJobs)).toEqual([]);
  });

  it("counts toward the limit like a new link", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const first = await linked(db, userId);
    await unlinkWallet(db, { userId, walletId: first.id, deleteHistory: false, now: NOW });
    for (let i = 0; i < LIMIT; i++) await linked(db, userId);

    expect(await linkWith(db, userId, first)).toEqual({ kind: "refused", reason: "link_limit" });
  });
});

describe("listWallets", () => {
  it("lists the Mercury wallet first, then linked wallets in the order they were linked", async () => {
    const db = await testDb();
    const { userId, mercury } = await person(db, "did:privy:a");
    const second = await linked(db, userId, later(2_000));
    const first = await linked(db, userId, later(1_000));

    const rows = await listWallets(db, userId);

    expect(rows.map((w) => w.id)).toEqual([mercury, first.id, second.id]);
    expect(rows[0]).toMatchObject({ isPrimary: true, kind: "privy_embedded", linkedAt: null });
  });

  it("leaves out a wallet that was unlinked, and anyone else's", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const gone = await linked(db, alice.userId);
    const kept = await linked(db, alice.userId);
    await linked(db, bob.userId);
    await unlinkWallet(db, { userId: alice.userId, walletId: gone.id, deleteHistory: false, now: NOW });

    expect((await listWallets(db, alice.userId)).map((w) => w.id)).toEqual([alice.mercury, kept.id]);
  });
});

describe("renameWallet", () => {
  it("names a linked wallet, and clears the name with null", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);

    expect(await renameWallet(db, { userId, walletId: phantom.id, label: "Phantom main" })).toMatchObject({
      kind: "renamed",
      wallet: { id: phantom.id, label: "Phantom main" },
    });
    expect(await renameWallet(db, { userId, walletId: phantom.id, label: null })).toMatchObject({
      kind: "renamed",
      wallet: { label: null },
    });
  });

  it("leaves the Mercury wallet's name alone", async () => {
    const db = await testDb();
    const { userId, mercury } = await person(db, "did:privy:a");
    expect(await renameWallet(db, { userId, walletId: mercury, label: "Mine" })).toEqual({ kind: "primary" });
  });

  it("finds neither someone else's wallet nor an unlinked one", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const bobs = await linked(db, bob.userId);
    const gone = await linked(db, alice.userId);
    await unlinkWallet(db, { userId: alice.userId, walletId: gone.id, deleteHistory: false, now: NOW });

    for (const walletId of [bobs.id, gone.id]) {
      expect(await renameWallet(db, { userId: alice.userId, walletId, label: "x" })).toEqual({
        kind: "not_found",
      });
    }
  });
});

describe("unlinkWallet", () => {
  it("stops following the wallet, keeps its rows, and forgets what it was warned about", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    await db
      .insert(activities)
      .values({ userId, walletId: phantom.id, kind: "transfer_in", title: "Added cash" });
    await db.insert(loanAlerts).values({ walletId: phantom.id, userId, health: "margin_call" });

    expect(await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW })).toEqual({
      kind: "unlinked",
    });

    const [row] = await db.select().from(wallets).where(eq(wallets.id, phantom.id));
    expect(row!.unlinkedAt).toEqual(NOW);
    expect(await db.select().from(activities).where(eq(activities.walletId, phantom.id))).toHaveLength(1);
    expect(await db.select().from(loanAlerts).where(eq(loanAlerts.walletId, phantom.id))).toEqual([]);
  });

  it("lists a wallet unlinked with its history kept, until that history is deleted, with no relink", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    expect(await keptWallets(db, userId)).toEqual([]);

    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW });
    expect((await keptWallets(db, userId)).map((k) => [k.id, k.unlinkedAt])).toEqual([[phantom.id, NOW]]);
    // Nobody else's: another person sees none of it.
    const other = await person(db, "did:privy:b");
    expect(await keptWallets(db, other.userId)).toEqual([]);

    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: true, now: later(1_000) });
    expect(await keptWallets(db, userId)).toEqual([]);
    expect(await db.select().from(wallets).where(eq(wallets.id, phantom.id))).toEqual([]);
  });

  it("is the same answer the second time, and keeps the first time it was unlinked", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW });

    expect(
      await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: later(5_000) }),
    ).toEqual({
      kind: "unlinked",
    });
    const [row] = await db.select().from(wallets).where(eq(wallets.id, phantom.id));
    expect(row!.unlinkedAt).toEqual(NOW);
  });

  it("with its history, deletes the wallet and what it owned, keeps its orders, and frees the address", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const phantom = await linked(db, alice.userId);
    const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
    await db
      .insert(activities)
      .values({ userId: alice.userId, walletId: phantom.id, kind: "transfer_in", title: "Added cash" });
    const [order] = await db
      .insert(orders)
      .values({
        userId: alice.userId,
        walletId: phantom.id,
        instrumentId: instrument!.id,
        side: "buy",
        usdAmount: "10",
        decision: {},
        status: "filled",
      })
      .returning();

    await unlinkWallet(db, { userId: alice.userId, walletId: phantom.id, deleteHistory: true, now: NOW });

    expect(await db.select().from(wallets).where(eq(wallets.id, phantom.id))).toEqual([]);
    expect(await db.select().from(activities).where(eq(activities.userId, alice.userId))).toEqual([]);
    const [kept] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(kept!.walletId).toBeNull();
    expect((await linkWith(db, bob.userId, phantom)).kind).toBe("linked");
  });

  it("can delete the history of a wallet that was already unlinked", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const phantom = await linked(db, userId);
    await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: false, now: NOW });

    expect(await unlinkWallet(db, { userId, walletId: phantom.id, deleteHistory: true, now: NOW })).toEqual({
      kind: "unlinked",
    });
    expect(await db.select().from(wallets).where(eq(wallets.id, phantom.id))).toEqual([]);
  });

  it("never unlinks or deletes the Mercury wallet", async () => {
    const db = await testDb();
    const { userId, mercury } = await person(db, "did:privy:a");
    for (const deleteHistory of [false, true]) {
      expect(await unlinkWallet(db, { userId, walletId: mercury, deleteHistory, now: NOW })).toEqual({
        kind: "primary",
      });
    }
    const [row] = await db.select().from(wallets).where(eq(wallets.id, mercury));
    expect(row!.unlinkedAt).toBeNull();
  });

  it("touches nobody else's wallet", async () => {
    const db = await testDb();
    const alice = await person(db, "did:privy:alice");
    const bob = await person(db, "did:privy:bob");
    const bobs = await linked(db, bob.userId);

    for (const deleteHistory of [false, true]) {
      expect(
        await unlinkWallet(db, { userId: alice.userId, walletId: bobs.id, deleteHistory, now: NOW }),
      ).toEqual({
        kind: "not_found",
      });
    }
    const [row] = await db.select().from(wallets).where(eq(wallets.id, bobs.id));
    expect(row!.unlinkedAt).toBeNull();
  });
});

describe("pruneLinkChallenges", () => {
  it("drops challenges older than a day and keeps the rest", async () => {
    const db = await testDb();
    const { userId } = await person(db, "did:privy:a");
    const challenge = (createdAt: Date) => ({
      userId,
      address: "A",
      message: "m",
      expiresAt: createdAt,
      createdAt,
    });
    await db
      .insert(walletLinkChallenges)
      .values([challenge(later(-25 * 3600_000)), challenge(later(-23 * 3600_000)), challenge(NOW)]);

    expect(await pruneLinkChallenges(db, NOW)).toBe(1);
    expect(await db.select().from(walletLinkChallenges)).toHaveLength(2);
  });
});
