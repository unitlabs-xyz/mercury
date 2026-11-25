import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mercuryWallet, testDb } from "../db/testing.js";
import { historyJobs, users, wallets } from "../db/schema.js";
import {
  BACKOFF_CAP_MS,
  LEASE_MS,
  MAX_ATTEMPTS,
  claimHistoryJob,
  deferHistoryPass,
  dropWalk,
  keepWalk,
  othersWaiting,
  takeTurn,
  failHistoryPass,
  failureBackoffMs,
  finishHistoryPass,
  queueHistory,
  queueMercuryEarnReads,
} from "./queue.js";

const T0 = new Date("2026-11-24T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:history" }).returning();
  const mercuryId = await mercuryWallet(db, user!.id);
  const link = async (address: string) => {
    const [w] = await db
      .insert(wallets)
      .values({ userId: user!.id, address, kind: "external", isPrimary: false, linkedAt: T0 })
      .returning();
    return w!.id;
  };
  const job = async (walletId: string) =>
    (await db.select().from(historyJobs).where(eq(historyJobs.walletId, walletId)))[0]!;
  return { db, userId: user!.id, mercuryId, link, job };
};

describe("queueHistory", () => {
  it("queues a newly linked wallet's first read, due at once", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    expect(await s.job(w)).toMatchObject({ status: "queued", attempts: 0, cursors: {}, runAfter: T0 });
  });

  it("queues a wallet linked again from its kept cursors, and makes it calculate again", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await s.db
      .update(historyJobs)
      .set({ status: "done", cursors: { acct: "SigNewest" }, attempts: 3, lastError: "x" })
      .where(eq(historyJobs.walletId, w));

    await queueHistory(s.db, { walletId: w, userId: s.userId, now: at(60_000) });
    expect(await s.job(w)).toMatchObject({
      status: "queued",
      cursors: { acct: "SigNewest" },
      attempts: 0,
      lastError: null,
      runAfter: at(60_000),
    });
  });
});

describe("claimHistoryJob", () => {
  it("takes a due job, marks a first read running, and holds it for the lease", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });

    const claimed = await claimHistoryJob(s.db, T0);
    expect(claimed).toMatchObject({ walletId: w, status: "running", startedAt: T0, runAfter: at(LEASE_MS) });
    // Held: a second reader finds nothing until the lease ends.
    expect(await claimHistoryJob(s.db, at(LEASE_MS - 1))).toBeNull();
    // A reader that died mid-pass gives it back when the lease ends.
    expect((await claimHistoryJob(s.db, at(LEASE_MS)))?.walletId).toBe(w);
  });

  it("takes nothing before it is due", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: at(60_000) });
    expect(await claimHistoryJob(s.db, T0)).toBeNull();
  });

  it("never changes a ready wallet's status for a later pass", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await s.db.update(historyJobs).set({ status: "done" }).where(eq(historyJobs.walletId, w));

    expect(await claimHistoryJob(s.db, T0)).toMatchObject({ status: "done", runAfter: at(LEASE_MS) });
  });

  it("puts first reads before later passes, then the longest waiting first", async () => {
    const s = await seed();
    const later = await s.link("Later11111111111111111111111111111111111111");
    const first = await s.link("First11111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: later, userId: s.userId, now: at(-120_000) });
    await queueHistory(s.db, { walletId: first, userId: s.userId, now: T0 });
    await s.db.update(historyJobs).set({ status: "read" }).where(eq(historyJobs.walletId, later));

    expect((await claimHistoryJob(s.db, T0))?.walletId).toBe(first);
    expect((await claimHistoryJob(s.db, T0))?.walletId).toBe(later);
  });

  it("leaves an unlinked wallet's job waiting, cursors and all", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await s.db.update(wallets).set({ unlinkedAt: T0 }).where(eq(wallets.id, w));
    expect(await claimHistoryJob(s.db, T0)).toBeNull();
  });

  it("never gives one job to two readers claiming at once", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    const both = await Promise.all([claimHistoryJob(s.db, T0), claimHistoryJob(s.db, T0)]);
    expect(both.filter((j) => j !== null)).toHaveLength(1);
  });
});

describe("finishHistoryPass", () => {
  it("ends a first read at read, not done: costs come later, and until then the wallet calculates", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await claimHistoryJob(s.db, T0);

    await finishHistoryPass(s.db, {
      walletId: w,
      cursors: { a: "SigA" },
      now: at(1_000),
      nextRunAfter: at(300_000),
    });
    expect(await s.job(w)).toMatchObject({
      status: "read",
      cursors: { a: "SigA" },
      runAfter: at(300_000),
      finishedAt: at(1_000),
    });
  });

  it("merges a later pass's cursors and keeps a ready wallet ready", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await s.db
      .update(historyJobs)
      .set({ status: "done", cursors: { a: "SigA", b: "SigB" } })
      .where(eq(historyJobs.walletId, w));

    await finishHistoryPass(s.db, {
      walletId: w,
      cursors: { b: "SigB2", c: "SigC" },
      now: T0,
      nextRunAfter: T0,
    });
    expect(await s.job(w)).toMatchObject({ status: "done", cursors: { a: "SigA", b: "SigB2", c: "SigC" } });
  });

  it("clears the failures a pass had before it", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await failHistoryPass(s.db, { walletId: w, error: "timeout", now: T0 });
    await finishHistoryPass(s.db, { walletId: w, cursors: {}, now: T0, nextRunAfter: T0 });
    expect(await s.job(w)).toMatchObject({ attempts: 0, lastError: null });
  });
});

describe("failHistoryPass", () => {
  it("tries a failed first read again later, further out each time", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await claimHistoryJob(s.db, T0);

    await failHistoryPass(s.db, { walletId: w, error: "rpc down", now: T0 });
    expect(await s.job(w)).toMatchObject({
      status: "queued",
      attempts: 1,
      lastError: "rpc down",
      runAfter: at(60_000),
    });
    await failHistoryPass(s.db, { walletId: w, error: "rpc down", now: T0 });
    expect((await s.job(w)).runAfter).toEqual(at(120_000));
  });

  it("marks a first read that keeps failing as failed, still to be retried", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await failHistoryPass(s.db, { walletId: w, error: "x", now: T0 });
    const job = await s.job(w);
    expect(job).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(await claimHistoryJob(s.db, job.runAfter)).toMatchObject({ walletId: w, status: "running" });
  });

  it("leaves a ready wallet ready when a later pass fails", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await s.db.update(historyJobs).set({ status: "done" }).where(eq(historyJobs.walletId, w));
    await failHistoryPass(s.db, { walletId: w, error: "x", now: T0 });
    expect(await s.job(w)).toMatchObject({ status: "done", attempts: 1 });
  });

  it("keeps a long reason short", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await failHistoryPass(s.db, { walletId: w, error: "e".repeat(2_000), now: T0 });
    expect((await s.job(w)).lastError).toHaveLength(500);
  });
});

describe("deferHistoryPass", () => {
  it("puts a first read back without counting a failure, still calculating", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await claimHistoryJob(s.db, T0);
    await deferHistoryPass(s.db, { walletId: w, until: at(60_000) });
    expect(await s.job(w)).toMatchObject({ status: "queued", attempts: 0, runAfter: at(60_000) });
  });

  it("keeps a ready wallet ready, and its cursors as they were", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await s.db
      .update(historyJobs)
      .set({ status: "read", cursors: { a: "SigA" } })
      .where(eq(historyJobs.walletId, w));
    await deferHistoryPass(s.db, { walletId: w, until: at(60_000) });
    expect(await s.job(w)).toMatchObject({ status: "read", cursors: { a: "SigA" }, attempts: 0 });
  });
});

describe("failureBackoffMs", () => {
  it("starts at a minute and doubles, up to the cap", () => {
    expect(failureBackoffMs(1)).toBe(60_000);
    expect(failureBackoffMs(2)).toBe(120_000);
    expect(failureBackoffMs(5)).toBe(16 * 60_000);
    expect(failureBackoffMs(50)).toBe(BACKOFF_CAP_MS);
  });
});

describe("the Mercury wallets' Earn reads", () => {
  it("gives every Mercury wallet a job once, and nothing to a linked wallet", async () => {
    const s = await seed();
    const linked = await s.link("Phantom1111111111111111111111111111111111111");
    await queueMercuryEarnReads(s.db, T0);
    await queueMercuryEarnReads(s.db, at(60_000));
    const jobs = await s.db.select().from(historyJobs);
    expect(jobs.map((j) => [j.walletId, j.status, j.runAfter])).toEqual([[s.mercuryId, "queued", T0]]);
    expect(jobs.some((j) => j.walletId === linked)).toBe(false);
  });

  it("come after linked wallets' reads, however long they have waited", async () => {
    const s = await seed();
    // The Mercury wallet's job has waited a day; a wallet linked just now waits on "Calculating…".
    await queueMercuryEarnReads(s.db, at(-86_400_000));
    const linked = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: linked, userId: s.userId, now: T0 });
    expect((await claimHistoryJob(s.db, T0))?.walletId).toBe(linked);
    expect((await claimHistoryJob(s.db, T0))?.walletId).toBe(s.mercuryId);
  });
});

describe("a wallet linked again while a pass of it ran", () => {
  it("is not marked read by the old pass: the gap it was queued to read is still to come", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    await finishHistoryPass(s.db, { walletId: w, cursors: { a: "Sig1" }, now: at(1), nextRunAfter: at(2) });
    await s.db.update(historyJobs).set({ status: "done" }).where(eq(historyJobs.walletId, w));

    // A later pass is claimed; meanwhile the wallet is unlinked and linked again.
    const claimed = await claimHistoryJob(s.db, at(10));
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: at(20) });

    await finishHistoryPass(s.db, {
      walletId: w,
      cursors: { a: "Sig2" },
      now: at(30),
      nextRunAfter: at(3_600_000),
      claimedAt: claimed!.startedAt,
    });
    // What it read is kept; the wallet still calculates, due at once.
    expect(await s.job(w)).toMatchObject({ status: "queued", cursors: { a: "Sig2" }, runAfter: at(20) });

    await deferHistoryPass(s.db, { walletId: w, until: at(60_000), claimedAt: claimed!.startedAt });
    await failHistoryPass(s.db, { walletId: w, error: "x", now: at(40), claimedAt: claimed!.startedAt });
    expect(await s.job(w)).toMatchObject({ status: "queued", runAfter: at(20), attempts: 0 });
  });

  it("is finished by the pass that claimed it", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    const claimed = await claimHistoryJob(s.db, T0);
    await finishHistoryPass(s.db, {
      walletId: w,
      cursors: {},
      now: at(1),
      nextRunAfter: at(2),
      claimedAt: claimed!.startedAt,
    });
    expect((await s.job(w)).status).toBe("read");
  });
});

describe("taking turns", () => {
  it("puts a wallet whose turn ended behind everyone already waiting, later passes included", async () => {
    const s = await seed();
    const long = await s.link("Phantom1111111111111111111111111111111111111");
    const other = await s.link("Phantom2222222222222222222222222222222222222");
    await queueHistory(s.db, { walletId: long, userId: s.userId, now: T0 });
    // The other wallet, read before, waits for a later pass.
    await queueHistory(s.db, { walletId: other, userId: s.userId, now: T0 });
    await s.db
      .update(historyJobs)
      .set({ status: "done", startedAt: at(-1), runAfter: at(5_000) })
      .where(eq(historyJobs.walletId, other));

    const first = await claimHistoryJob(s.db, at(1_000));
    expect(first?.walletId).toBe(long);
    expect(await othersWaiting(s.db, long, at(11_000))).toBe(true);
    await takeTurn(s.db, { walletId: long, now: at(11_000), claimedAt: first!.startedAt });
    expect((await s.job(long)).status).toBe("queued");

    // The other wallet's later pass has waited longer: it goes next, then the long one again.
    expect((await claimHistoryJob(s.db, at(11_000)))?.walletId).toBe(other);
    expect((await claimHistoryJob(s.db, at(11_000)))?.walletId).toBe(long);
  });

  it("finds nobody waiting where only Mercury wallets' Earn reads are due: they come last anyway", async () => {
    const s = await seed();
    const long = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: long, userId: s.userId, now: T0 });
    await queueMercuryEarnReads(s.db, T0);
    expect(await othersWaiting(s.db, long, at(1_000))).toBe(false);
  });

  it("keeps a walk's place, and forgets it once the walk is over", async () => {
    const s = await seed();
    const w = await s.link("Phantom1111111111111111111111111111111111111");
    await queueHistory(s.db, { walletId: w, userId: s.userId, now: T0 });
    const walk = { newest: "S9", before: "S5", pledged: "0", oldestRaw: null, oldestAt: null, count: 4 };
    await keepWalk(s.db, w, "acct-a", walk);
    await keepWalk(s.db, w, "acct-b", { ...walk, before: "S2" });
    await dropWalk(s.db, w, "acct-a");
    expect((await s.job(w)).walks).toEqual({ "acct-b": { ...walk, before: "S2" } });
  });
});
