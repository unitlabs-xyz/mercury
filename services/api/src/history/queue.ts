import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { historyJobs, wallets, type HistoryJob } from "../db/schema.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The history reader's queue: one `history_job` row per linked wallet.
 *
 * A job's status says how far its **first** read has got, and nothing else:
 *
 * - `queued`: linked (or linked again), not read yet.
 * - `running`: its first read is under way.
 * - `read`: everything up to now has been read. Its P&L still waits for the
 *   cost pass (step 7), which moves it on to `done`. Until a job is `done`
 *   the wallet says "Calculating…" rather than a figure, because a figure
 *   before its costs are known would be wrong, and $0 most of all.
 * - `done`: read and costed. The summary counts it as ready.
 * - `failed`: its first read failed too often in a row; still retried, rarely.
 *
 * Later passes (reading only what is newer than each cursor) never change
 * the status, so a ready wallet never flickers back to "Calculating…" while
 * one runs. What stops two readers taking the same job is a lease instead:
 * claiming a job moves its `run_after` out by the lease, so a reader that
 * died mid-pass gives the job back when the lease ends.
 */

/** How long a claimed job is held before another reader may take it. Longer than any pass. */
export const LEASE_MS = 30 * 60_000;
/** First-read failures in a row before a job is marked `failed`. It is still retried, at the cap. */
export const MAX_ATTEMPTS = 8;
/** The longest a failing job waits between tries. */
export const BACKOFF_CAP_MS = 6 * 60 * 60_000;

/** Statuses whose first read is not finished. */
const UNREAD = ["queued", "running", "failed"] as const;

/**
 * Queue a wallet's read: on a first link, and on every link again. Linking
 * again keeps the wallet's cursors, so the reader reads only what happened
 * while it was unlinked; until that is read, the wallet is "Calculating…"
 * again, exactly as on a first link.
 */
export async function queueHistory(
  tx: Db | Tx,
  input: { readonly walletId: string; readonly userId: string; readonly now: Date },
): Promise<void> {
  await tx
    .insert(historyJobs)
    .values({ walletId: input.walletId, userId: input.userId, status: "queued", runAfter: input.now })
    .onConflictDoUpdate({
      target: historyJobs.walletId,
      set: {
        status: "queued",
        attempts: 0,
        lastError: null,
        runAfter: input.now,
        startedAt: null,
        finishedAt: null,
      },
    });
}

/**
 * Take the next job that is due, or null. First reads come before later
 * passes, and the longest-waiting first. Only a followed wallet's job is
 * taken: an unlinked wallet's waits, cursors and all, for a link again.
 *
 * `for update skip locked`, so two readers never take the same row; the lease
 * then keeps it theirs after this transaction ends.
 */
export async function claimHistoryJob(db: Db, now: Date): Promise<HistoryJob | null> {
  return db.transaction(async (tx) => {
    const [due] = await tx
      .select({ job: historyJobs })
      .from(historyJobs)
      .innerJoin(wallets, eq(wallets.id, historyJobs.walletId))
      .where(and(lte(historyJobs.runAfter, now), isNull(wallets.unlinkedAt)))
      .orderBy(
        sql`case when ${historyJobs.status} in ('queued', 'running', 'failed') then 0 else 1 end`,
        historyJobs.runAfter,
      )
      .limit(1)
      .for("update", { of: historyJobs, skipLocked: true });
    if (due === undefined) return null;

    const first = (UNREAD as readonly string[]).includes(due.job.status);
    const [claimed] = await tx
      .update(historyJobs)
      .set({
        runAfter: new Date(now.getTime() + LEASE_MS),
        startedAt: now,
        // Only a first read changes the status; a later pass leaves a ready wallet ready.
        ...(first ? { status: "running" as const } : {}),
      })
      .where(eq(historyJobs.walletId, due.job.walletId))
      .returning();
    return claimed ?? null;
  });
}

/**
 * A pass finished. Its cursors are merged in (an account not read this pass
 * keeps its own), the next pass is due at `nextRunAfter`, and a first read
 * becomes `read`. A wallet already `read` or `done` keeps its status.
 */
export async function finishHistoryPass(
  db: Db,
  input: {
    readonly walletId: string;
    readonly cursors: Readonly<Record<string, string>>;
    readonly now: Date;
    readonly nextRunAfter: Date;
  },
): Promise<void> {
  await db
    .update(historyJobs)
    .set({
      cursors: sql`${historyJobs.cursors} || ${JSON.stringify(input.cursors)}::jsonb`,
      status: sql`case when ${historyJobs.status} in ('queued', 'running', 'failed') then 'read' else ${historyJobs.status} end`,
      attempts: 0,
      lastError: null,
      runAfter: input.nextRunAfter,
      finishedAt: input.now,
    })
    .where(eq(historyJobs.walletId, input.walletId));
}

/**
 * Put a job back without counting a failure: the node refused the reader, or
 * the jobs' own lane was being refused, which says nothing about the wallet.
 * A first read goes back to `queued`, so it is still "Calculating…"; a later
 * pass keeps its status. What it read before stopping stands: its cursors
 * only move once a pass finishes.
 */
export async function deferHistoryPass(
  db: Db,
  input: { readonly walletId: string; readonly until: Date },
): Promise<void> {
  await db
    .update(historyJobs)
    .set({
      runAfter: input.until,
      status: sql`case when ${historyJobs.status} = 'running' then 'queued' else ${historyJobs.status} end`,
    })
    .where(eq(historyJobs.walletId, input.walletId));
}

/** How long to wait after the `n`th failure in a row: a minute, doubling, up to the cap. */
export const failureBackoffMs = (attempts: number): number =>
  Math.min(60_000 * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);

/**
 * A pass failed. Tried again later, further out each time, so a broken wallet
 * does not spin. A first read that keeps failing is marked `failed` (still
 * "Calculating…", still retried at the cap); a later pass that fails leaves
 * the status alone, since what was already read stands.
 *
 * `error` is a short reason for the row, never an address: it is read next to
 * the user it belongs to.
 */
export async function failHistoryPass(
  db: Db,
  input: { readonly walletId: string; readonly error: string; readonly now: Date },
): Promise<void> {
  const [job] = await db
    .select({ status: historyJobs.status, attempts: historyJobs.attempts })
    .from(historyJobs)
    .where(eq(historyJobs.walletId, input.walletId))
    .limit(1);
  if (job === undefined) return;
  const attempts = job.attempts + 1;
  const first = (UNREAD as readonly string[]).includes(job.status);
  await db
    .update(historyJobs)
    .set({
      attempts,
      lastError: input.error.slice(0, 500),
      runAfter: new Date(input.now.getTime() + failureBackoffMs(attempts)),
      ...(first ? { status: attempts >= MAX_ATTEMPTS ? ("failed" as const) : ("queued" as const) } : {}),
    })
    .where(eq(historyJobs.walletId, input.walletId));
}
