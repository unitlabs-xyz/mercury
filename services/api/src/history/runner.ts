import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { tokens, wallets } from "../db/schema.js";
import { DORMANT_IDLE_MS, RECENT_IDLE_MS, VIEWED_WITHIN_MS } from "../jobs/tiers.js";
import type { Log } from "../log/index.js";
import { errorLine } from "../log.js";
import { RateLimited, REFUSAL_PAUSE_MS } from "./budget.js";
import {
  claimHistoryJob,
  deferHistoryPass,
  failHistoryPass,
  finishHistoryPass,
  othersWaiting,
  queueMercuryEarnReads,
  takeTurn,
} from "./queue.js";
import { GiveWay, PledgeUnknown, readWallet, TurnOver, type ReaderDeps } from "./reader.js";
import { costWallet, walletToCost, type CostDeps } from "./cost.js";
import { readLoanHistory, type LoanHistoryDeps } from "./loan.js";
import { settleLiquidations } from "../lending/liquidation-pnl.js";
import { Unlinked } from "../wallets/active.js";

/**
 * When a wallet's next later pass is due, by how recently anyone looked at
 * it: every five minutes for a wallet viewed in the last week, hourly
 * otherwise, as the other jobs read linked wallets.
 */
export const nextPassIn = (lastViewedAt: Date | null, now: number): number =>
  lastViewedAt !== null && now - lastViewedAt.getTime() < VIEWED_WITHIN_MS ? RECENT_IDLE_MS : DORMANT_IDLE_MS;

export interface HistoryRunDeps {
  readonly db: Db;
  readonly reader: Omit<ReaderDeps, "db"> & {
    /**
     * The Earn vaults' share tokens. A Mercury wallet's job reads only these:
     * shares sent to or from it by hand are money in or out, not interest.
     * Absent, Mercury wallets are not read.
     */
    readonly earnShareMints?: () => Promise<ReadonlySet<string>>;
  };
  /** The wallet's Kamino loan, read with its tokens. Absent, a pass reads tokens only. */
  readonly loan?: Omit<LoanHistoryDeps, "db">;
  readonly now?: () => number;
  readonly log: Log;
  /** How long one wallet may read while another waits. `HISTORY_TURN_MS` by default. */
  readonly turnMs?: number;
}

/**
 * One wallet's turn with the reader, while another waits: ten seconds, about
 * twenty calls at the reader's two a second. A first read has no cap (a cost
 * guessed where a walk stopped short would be wrong for good), so a wallet
 * with a vast past, or one sent dust to keep it from ever reading empty, could
 * otherwise hold the reader for days while everyone else stayed "Calculating…".
 * Turn about, it gets the reader whenever nobody else wants it, and everybody
 * else still gets theirs.
 */
export const HISTORY_TURN_MS = 10_000;

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
/** How often a Mercury wallet's Earn shares are read: they are rarely sent in or out by hand. */
const MERCURY_EVERY_MS = 24 * 60 * 60_000;

/** How often Mercury wallets that have no job get one. */
const QUEUE_MERCURY_EVERY_MS = 10 * 60_000;

export const historyPass = (deps: HistoryRunDeps) => {
  let queuedAt = Number.NEGATIVE_INFINITY;
  return async (): Promise<string | null> => {
    const now = deps.now ?? Date.now;
    const at = new Date(now());

    // Not even a claim while the jobs' own lane is refused: their reads come first.
    if (deps.reader.laneBusy()) return null;

    if (deps.reader.earnShareMints !== undefined && at.getTime() - queuedAt >= QUEUE_MERCURY_EVERY_MS) {
      queuedAt = at.getTime();
      await queueMercuryEarnReads(deps.db, at);
    }

    const job = await claimHistoryJob(deps.db, at);
    if (job === null) return null;
    const [wallet] = await deps.db
      .select({ address: wallets.address, lastViewedAt: wallets.lastViewedAt, isPrimary: wallets.isPrimary })
      .from(wallets)
      .where(eq(wallets.id, job.walletId))
      .limit(1);
    if (wallet === undefined) return null; // deleted mid-claim; its job went with it

    try {
      // The Mercury wallet: its Earn shares alone. A deployment without Earn reads none of it.
      const onlyMints = wallet.isPrimary
        ? ((await deps.reader.earnShareMints?.()) ?? new Set<string>())
        : undefined;
      // Its Earn shares are never pledged: no need to ask Kamino, or to wait on it when it is down.
      const { pledged, ...reader } = deps.reader;
      // Its turn: once it has had its time, it carries on only while nobody else is waiting.
      const began = now();
      const turnMs = deps.turnMs ?? HISTORY_TURN_MS;
      const turnOver = async () =>
        now() - began >= turnMs && (await othersWaiting(deps.db, job.walletId, new Date(now())));
      const r = await readWallet(
        {
          ...reader,
          ...(wallet.isPrimary || pledged === undefined ? {} : { pledged }),
          db: deps.db,
          turnOver,
        },
        { ...job, address: wallet.address, ...(onlyMints === undefined ? {} : { onlyMints }) },
      );
      const done = new Date(now());
      await finishHistoryPass(deps.db, {
        walletId: job.walletId,
        cursors: r.cursors,
        opening: r.opening,
        now: done,
        claimedAt: job.startedAt,
        // A Mercury wallet's Earn shares are rarely sent in by hand: a pass a day.
        nextRunAfter: new Date(
          done.getTime() +
            (wallet.isPrimary ? MERCURY_EVERY_MS : nextPassIn(wallet.lastViewedAt, done.getTime())),
        ),
      });
      // The person and the wallet's id, never the address: an address in a log is a person's holdings in a log.
      if (r.capped > 0) {
        deps.log.warn(
          { userId: job.userId, walletId: job.walletId, capped: r.capped },
          "history read stopped at its cap on an account that never went to zero",
        );
      }
      /*
       * Loan-watch reads every loan's history already, the Mercury wallet's
       * included. Not while the jobs' lane is being refused, whose reads this
       * is: the next pass reads it.
       */
      const loan =
        wallet.isPrimary || deps.reader.laneBusy()
          ? 0
          : await loanPass(deps, {
              userId: job.userId,
              walletId: job.walletId,
              address: wallet.address,
            });
      const first = job.status === "running";
      if (!first && r.transactions === 0 && loan === 0) return null;
      return `${first ? "first read" : "later pass"}: ${r.transactions} transactions, ${r.events} events across ${r.accounts} accounts${loan > 0 ? `, ${loan} loan events` : ""}`;
    } catch (error: unknown) {
      // Unlinked mid-pass: what it read stays as it was, frozen, and its job waits for a link again.
      if (error instanceof Unlinked) return "stopped: the wallet was unlinked";
      // Its turn is up and another wallet is waiting: back in line, to carry on from where it stopped.
      if (error instanceof TurnOver) {
        await takeTurn(deps.db, { walletId: job.walletId, now: new Date(now()), claimedAt: job.startedAt });
        return "took its turn: carrying on after the next wallet";
      }
      // Kamino unreadable is a wait too: without the pledge, a pledged holding would be read as sold.
      if (error instanceof RateLimited || error instanceof GiveWay || error instanceof PledgeUnknown) {
        await deferHistoryPass(deps.db, {
          walletId: job.walletId,
          until: new Date(now() + REFUSAL_PAUSE_MS),
          claimedAt: job.startedAt,
        });
        return error instanceof RateLimited
          ? "paused: the node refused the reader"
          : error instanceof GiveWay
            ? "gave way to the jobs' lane"
            : "paused: Kamino could not be read";
      }
      await failHistoryPass(deps.db, {
        walletId: job.walletId,
        error: errorLine(error),
        now: new Date(now()),
        claimedAt: job.startedAt,
      });
      throw error;
    }
  };
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
      // With the wallet's lots in place, a liquidation read before them can say what it realised.
      if (r.ready) await settleLiquidations(deps.db, walletId);
      if (r.lots === 0 && r.dividends === 0 && !r.ready) return null;
      return `${r.ready ? "first costing" : "later costing"}: ${r.lots} lots, ${r.dividends} dividends from ${r.costed} movements`;
    } catch (error: unknown) {
      failing.set(walletId, { count: failures + 1, at: t });
      throw error;
    }
  };
};
