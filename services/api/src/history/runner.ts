import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { tokens, wallets } from "../db/schema.js";
import { DORMANT_IDLE_MS, RECENT_IDLE_MS, VIEWED_WITHIN_MS } from "../jobs/tiers.js";
import type { Log } from "../log/index.js";
import { errorLine } from "../log.js";
import { RateLimited, REFUSAL_PAUSE_MS } from "./budget.js";
import { claimHistoryJob, deferHistoryPass, failHistoryPass, finishHistoryPass } from "./queue.js";
import { GiveWay, readWallet, type ReaderDeps } from "./reader.js";
import { costWallet, walletToCost, type CostDeps } from "./cost.js";
import { readLoanHistory, type LoanHistoryDeps } from "./loan.js";

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
  /** The wallet's Kamino loan, read with its tokens. Absent, a pass reads tokens only. */
  readonly loan?: Omit<LoanHistoryDeps, "db">;
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
    const loan = await loanPass(deps, {
      userId: job.userId,
      walletId: job.walletId,
      address: wallet.address,
    });
    const first = job.status === "running";
    if (!first && r.transactions === 0 && loan === 0) return null;
    return `${first ? "first read" : "later pass"}: ${r.transactions} transactions, ${r.events} events across ${r.accounts} accounts${loan > 0 ? `, ${loan} loan events` : ""}`;
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
 * The wallet's loan history, after its tokens. Best effort: a loan that cannot
 * be read now is read on the next pass, and never holds up the wallet's P&L,
 * which waits only for its tokens. Returns the rows written.
 */
const loanPass = async (
  deps: HistoryRunDeps,
  wallet: { readonly userId: string; readonly walletId: string; readonly address: string },
): Promise<number> => {
  if (deps.loan === undefined) return 0;
  try {
    const r = await readLoanHistory({ ...deps.loan, db: deps.db }, wallet);
    return r.kind === "read" ? r.written : 0;
  } catch (error: unknown) {
    deps.log.warn(
      { userId: wallet.userId, walletId: wallet.walletId, err: errorLine(error) },
      "could not read the loan's history; trying again next pass",
    );
    return 0;
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

/** Failures of the historical source in a row before a wallet is costed from Mercury's own prices instead. */
export const PAST_GIVE_UP_AFTER = 3;
/** The longest a wallet whose costing keeps failing rests before it is tried again. */
const COST_REST_CAP_MS = 60 * 60_000;

/**
 * One pass of the cost pass: the next wallet with movements to cost, costed.
 *
 * A wallet whose costing fails rests, a minute and doubling up to an hour,
 * so it never holds up the others. A wallet waits for the historical price
 * source first, and after `PAST_GIVE_UP_AFTER` failures in a row is costed
 * from Mercury's own prices instead: every share ends with a cost. Failures
 * are counted in memory, one process, like the reader's lane signal; a
 * restart starts the count again, which only means waiting a little longer.
 */
export const costPass = (
  deps: Omit<CostDeps, "skipPast"> & { readonly now?: () => number; readonly log: Log },
) => {
  const failing = new Map<string, { count: number; at: number }>();
  return async (): Promise<string | null> => {
    const now = deps.now ?? Date.now;
    const t = now();
    const resting = [...failing.entries()]
      .filter(([, f]) => t - f.at < Math.min(60_000 * 2 ** (f.count - 1), COST_REST_CAP_MS))
      .map(([id]) => id);
    const walletId = await walletToCost(deps.db, resting);
    if (walletId === null) return null;

    const failures = failing.get(walletId)?.count ?? 0;
    try {
      const r = await costWallet(
        { ...deps, skipPast: failures >= PAST_GIVE_UP_AFTER },
        walletId,
        new Date(t),
      );
      failing.delete(walletId);
      if (r.lots === 0 && r.dividends === 0 && !r.ready) return null;
      return `${r.ready ? "first costing" : "later costing"}: ${r.lots} lots, ${r.dividends} dividends from ${r.costed} movements`;
    } catch (error: unknown) {
      failing.set(walletId, { count: failures + 1, at: t });
      throw error;
    }
  };
};
