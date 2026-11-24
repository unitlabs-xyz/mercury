import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { tokens, wallets } from "../db/schema.js";
import { DORMANT_IDLE_MS, RECENT_IDLE_MS, VIEWED_WITHIN_MS } from "../jobs/tiers.js";
import type { Log } from "../log/index.js";
import { errorLine } from "../log.js";
import { RateLimited, REFUSAL_PAUSE_MS } from "./budget.js";
import { claimHistoryJob, deferHistoryPass, failHistoryPass, finishHistoryPass } from "./queue.js";
import { GiveWay, readWallet, type ReaderDeps } from "./reader.js";

/**
 * When a wallet's next later pass is due, by how recently anyone looked at
 * it: every five minutes for a wallet viewed in the last week, hourly
 * otherwise, as the other jobs read linked wallets.
 */
export const nextPassIn = (lastViewedAt: Date | null, now: number): number =>
  lastViewedAt !== null && now - lastViewedAt.getTime() < VIEWED_WITHIN_MS ? RECENT_IDLE_MS : DORMANT_IDLE_MS;

export interface HistoryRunDeps {
  readonly db: Db;
  readonly reader: Omit<ReaderDeps, "db">;
  readonly now?: () => number;
  readonly log: Log;
}

/**
 * One pass of the history reader: take the next due job, read it, and say
 * what happened. A job a pass could not finish because the node refused the
 * reader, or because the jobs' own lane was being refused, goes back for a
 * minute without counting against the wallet. Anything else is a failure,
 * tried again further out each time.
 *
 * Null when nothing was due, or the pass found nothing new: a quiet reader
 * says nothing in the log.
 */
export const historyPass = (deps: HistoryRunDeps) => async (): Promise<string | null> => {
  const now = deps.now ?? Date.now;
  const at = new Date(now());

  // Not even a claim while the jobs' own lane is refused: their reads come first.
  if (deps.reader.laneBusy()) return null;

  const job = await claimHistoryJob(deps.db, at);
  if (job === null) return null;
  const [wallet] = await deps.db
    .select({ address: wallets.address, lastViewedAt: wallets.lastViewedAt })
    .from(wallets)
    .where(eq(wallets.id, job.walletId))
    .limit(1);
  if (wallet === undefined) return null; // deleted mid-claim; its job went with it

  try {
    const r = await readWallet({ ...deps.reader, db: deps.db }, { ...job, address: wallet.address });
    const done = new Date(now());
    await finishHistoryPass(deps.db, {
      walletId: job.walletId,
      cursors: r.cursors,
      now: done,
      nextRunAfter: new Date(done.getTime() + nextPassIn(wallet.lastViewedAt, done.getTime())),
    });
    // The person and the wallet's id, never the address: an address in a log is a person's holdings in a log.
    if (r.capped > 0) {
      deps.log.warn(
        { userId: job.userId, walletId: job.walletId, capped: r.capped },
        "history read stopped at its cap on an account that never went to zero",
      );
    }
    const first = job.status === "running";
    if (!first && r.transactions === 0) return null;
    return `${first ? "first read" : "later pass"}: ${r.transactions} transactions, ${r.events} events across ${r.accounts} accounts`;
  } catch (error: unknown) {
    if (error instanceof RateLimited || error instanceof GiveWay) {
      await deferHistoryPass(deps.db, {
        walletId: job.walletId,
        until: new Date(now() + REFUSAL_PAUSE_MS),
      });
      return error instanceof RateLimited
        ? "paused: the node refused the reader"
        : "gave way to the jobs' lane";
    }
    await failHistoryPass(deps.db, { walletId: job.walletId, error: errorLine(error), now: new Date(now()) });
    throw error;
  }
};

/**
 * Every mint the reader keeps: the stocks' tokens, USDC, and the Earn vaults'
 * share tokens. Earn's list comes from Kamino's API; when it cannot be read
 * the stocks and USDC are still read, and the share tokens on the next pass.
 */
export const listedMints =
  (opts: {
    readonly db: Db;
    readonly usdcMint: string;
    readonly earnShareMints: () => Promise<readonly string[]>;
  }) =>
  async (): Promise<ReadonlySet<string>> => {
    const stocks = await opts.db.select({ mint: tokens.mint }).from(tokens);
    const shares = await opts.earnShareMints().catch(() => [] as readonly string[]);
    return new Set([opts.usdcMint, ...stocks.map((t) => t.mint), ...shares]);
  };
