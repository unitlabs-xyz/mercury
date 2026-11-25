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
