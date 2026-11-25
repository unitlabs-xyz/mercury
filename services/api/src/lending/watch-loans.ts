import { eq, inArray } from "drizzle-orm";
import type { Decimal } from "@mercury/core";
import { logger } from "../log/index.js";
import type { Db } from "../db/client.js";
import { activities, loanAlerts, users, wallets } from "../db/schema.js";
import type { Notifier } from "../notify/ports.js";
import { capacity } from "./capacity.js";
import { capacityInputFor } from "./input.js";
import type { LendingSource } from "./ports.js";
import type { ChainReader } from "@mercury/chain";
import { alertFor, forWallet, markAfter, rank } from "./watch.js";
import { followed, stillFollowed } from "../wallets/active.js";
import { notifyFor } from "../notify/inbox.js";
import type { Health } from "./capacity.js";
import type { LendingPosition } from "./ports.js";
import { readLoanHistory, type LoanHistoryDeps } from "../history/loan.js";

/*
 * Every write below checks the wallet is still followed (`stillFollowed`).
 * The pass reads its wallets once, then spends seconds on the chain. An
 * unlink in between must not be undone: no warning about a wallet the person
 * stopped following, and no `loan_alert` written back after unlinking cleared
 * it, or a relink would stay silent about a loan already in trouble.
 */

const log = logger("loan-watch");

export interface WatchDeps {
  readonly lending: LendingSource;
  readonly chain: ChainReader;
  readonly usdcMint: string;
  readonly notifier: Notifier;
  /**
   * Kamino's own record of each loan, read when something may have happened
   * that Mercury did not build: a liquidation, or collateral moved on
   * kamino.finance. Absent, only health is watched.
   */
  readonly loanHistory?: Pick<LoanHistoryDeps, "loans" | "market">;
}

/**
 * What the watcher saw of each loan on its last pass, and when it last read
 * each loan's history. In memory: a restart forgets it, and the first pass
 * after one reads every loan's history once, which is the safe direction.
 */
export interface LoanMemory {
  readonly pledged: Map<string, ReadonlyMap<string, bigint>>;
  readonly debt: Map<string, Decimal>;
  readonly readAt: Map<string, number>;
}

export const loanMemory = (): LoanMemory => ({ pledged: new Map(), debt: new Map(), readAt: new Map() });

/** The longest a loan goes without its history read, whatever else happens. */
export const HISTORY_EVERY_MS = 60 * 60_000;

const RISKY: ReadonlySet<string> = new Set(["margin_call", "liquidation"]);

/**
 * Whether to read a loan's history this pass. A liquidation is sent by a bot,
 * not built by Mercury, so nothing Mercury records sees it. The live loan
 * does: collateral that went down, or debt that did, since the last pass. Also
 * every loan that was last told it was close to liquidation, since a bot can
 * sell between two passes and leave the loan healthy again by the next, and
 * every loan once an hour, in case both slipped past.
 */
export const historyDue = (
  memory: LoanMemory,
  walletId: string,
  position: LendingPosition,
  told: string | null,
  now: number,
): boolean => {
  const before = memory.pledged.get(walletId);
  const fell =
    before !== undefined &&
    [...before].some(([mint, raw]) => {
      const left = position.deposits.filter((d) => d.mint === mint).reduce((s, d) => s + d.raw, 0n);
      return left < raw;
    });
  const debtBefore = memory.debt.get(walletId);
  const paid = debtBefore !== undefined && position.debtUsd.lt(debtBefore);
  const last = memory.readAt.get(walletId);
  const stale = last === undefined || now - last >= HISTORY_EVERY_MS;
  return fell || paid || (told !== null && RISKY.has(told)) || stale;
};

const remember = (memory: LoanMemory, walletId: string, position: LendingPosition): void => {
  const pledged = new Map<string, bigint>();
  for (const d of position.deposits) pledged.set(d.mint, (pledged.get(d.mint) ?? 0n) + d.raw);
  memory.pledged.set(walletId, pledged);
  memory.debt.set(walletId, position.debtUsd);
};

export interface WatchSummary {
  readonly loans: number;
  readonly alerted: number;
  readonly delivered: number;
  readonly failed: number;
  /** Liquidations found in loans' histories that were news, and told. */
  readonly liquidations: number;
}

/** One process's memory of the loans it watches. */
const defaultMemory = loanMemory();

/** As the other per-wallet jobs: enough in flight to batch, few enough to keep connections. */
const CONCURRENCY = 8;

/**
 * Every open loan, checked, and its owner told when it crosses a line.
 *
 * `capacity.ts` has known how close a loan is to liquidation since the day it
 * was written, and `LoanAlert` has rendered it faithfully — in a page somebody
 * has to have open. The person most likely to lose their collateral is exactly
 * the one not looking, so the check has to run somewhere that does not need a
 * browser. This is that somewhere.
 *
 * Reading a loan costs an RPC round trip per wallet, so this runs on a slower
 * clock than `position-sync`. That is a real trade: a gap that opens between
 * passes is a gap nobody is warned about. Five minutes is chosen against
 * Kamino's own margin — our alarm sits 15% of collateral value away from
 * liquidation, which no ordinary move closes in five minutes, and a move that
 * does would have outrun any cadence we could afford.
 */
export async function watchAllLoans(
  db: Db,
  deps: WatchDeps,
  now: Date,
  memory: LoanMemory = defaultMemory,
): Promise<WatchSummary> {
  const rows = await db
    .select({
      userId: users.id,
      walletId: wallets.id,
      email: users.email,
      address: wallets.address,
      kind: wallets.kind,
      label: wallets.label,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    // Every loan in every followed wallet, linked ones included, and at the same
    // pace: a loan Mercury cannot act for gets no slower a check.
    .where(followed);

  let loans = 0;
  let alerted = 0;
  let delivered = 0;
  let failed = 0;

  /*
   * Every wallet's loan first, all at once: Kamino's reader puts what is asked
   * together into one account read per hundred wallets. Only a wallet that owes
   * something is read further. Reading each wallet's balances before knowing
   * whether it had a loan cost two token-program calls a wallet, every five
   * minutes, to find none: seventeen wallets and no loans, 23 October 2026.
   * Gating on our own loan records instead would miss a loan opened before
   * they were kept, and a missed loan is the one this job exists for.
   */
  const owing: typeof rows = [];
  const withLoan: { row: (typeof rows)[number]; position: LendingPosition }[] = [];
  const loaded = await Promise.allSettled(rows.map((row) => deps.lending.position(row.address)));
  loaded.forEach((result, i) => {
    const row = rows[i]!;
    if (result.status === "rejected") {
      failed += 1;
      log.error({ userId: row.userId, err: result.reason }, "could not check a loan");
      return;
    }
    if (result.value === null) return;
    // A loan fully liquidated owes nothing, and still has a history to read.
    withLoan.push({ row, position: result.value });
    if (!result.value.debtUsd.isZero()) owing.push(row);
  });
  // What each loan was last told, before this pass tells it anything new.
  const toldBefore = new Map(
    withLoan.length === 0
      ? []
      : (
          await db
            .select({ walletId: loanAlerts.walletId, health: loanAlerts.health })
            .from(loanAlerts)
            .where(
              inArray(
                loanAlerts.walletId,
                withLoan.map((w) => w.row.walletId),
              ),
            )
        ).map((r) => [r.walletId, r.health]),
  );

  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const row = owing[next++];
      if (row === undefined) return;
      try {
        // Finalized: a dropped block would alarm a borrower who was fine, and
        // the record of having told them outlives it.
        const input = await capacityInputFor(
          deps,
          row.address,
          await deps.chain.tokenBalances(row.address, "finalized"),
        );
        if (input.position === null || input.position.debtUsd.isZero()) continue;
        loans += 1;

        const summary = capacity(input);
        const [existing] = await db
          .select({ health: loanAlerts.health, shown: loanAlerts.shownHealth })
          .from(loanAlerts)
          .where(eq(loanAlerts.walletId, row.walletId));
        const told = (existing?.health ?? null) as Health | null;
        const shown = (existing?.shown ?? null) as Health | null;

        const found = alertFor(told, summary);
        const alert = found === null ? null : forWallet(found, row);
        if (alert === null) {
          // Still record a return to health, so a relapse is worth saying again.
          if (told !== null && summary.health === "healthy") {
            await db.transaction(async (tx) => {
              if (!(await stillFollowed(tx, row.walletId))) return;
              await tx
                .insert(loanAlerts)
                .values({
                  walletId: row.walletId,
                  userId: row.userId,
                  health: "healthy",
                  shownHealth: null,
                  notifiedAt: now,
                })
                .onConflictDoUpdate({
                  target: loanAlerts.walletId,
                  set: { health: "healthy", shownHealth: null, notifiedAt: now },
                });
            });
          }
          continue;
        }

        /*
         * The feed row is written whether or not the mail lands, and it is
         * written first. It is the copy we control: a provider can be down and
         * an address can be wrong, but somebody who opens the app will see
         * this. The mail is what reaches somebody who does not open the app,
         * which is the harder and more important half. Its notification goes
         * with it, in the same transaction.
         */
        /*
         * Once per level, though. The mail is tried again every pass until it
         * gets through (`markAfter`), and the feed row used to be written again
         * with each try: the same warning every five minutes for someone with
         * no address, or while the mail provider was down.
         */
        const inApp = shown === null || rank(alert.health) > rank(shown);
        const stillHere = await db.transaction(async (tx) => {
          if (!(await stillFollowed(tx, row.walletId))) return false;
          if (!inApp) return true;
          await tx
            .insert(loanAlerts)
            .values({
              walletId: row.walletId,
              userId: row.userId,
              // Never told before: nothing to remember yet but that the app has said this.
              health: told ?? "healthy",
              shownHealth: alert.health,
              notifiedAt: now,
            })
            .onConflictDoUpdate({ target: loanAlerts.walletId, set: { shownHealth: alert.health } });
          const written = await tx
            .insert(activities)
            .values({
              userId: row.userId,
              walletId: row.walletId,
              kind: "loan_alert",
              occurredAt: now,
              title: alert.title,
              subtitle: alert.body,
              mint: null,
            })
            .onConflictDoNothing()
            .returning({ id: activities.id });
          await notifyFor(
            tx,
            row.userId,
            written.map((r) => ({ activityId: r.id, kind: "loan_alert" as const })),
          );
          return true;
        });
        // Unlinked while this pass was reading the chain: nothing said, nothing remembered.
        if (!stillHere) continue;
        if (inApp) alerted += 1;

        const sent = row.email === null ? false : await deps.notifier.send({ to: row.email, ...alert });
        if (sent) delivered += 1;

        const mark = markAfter(told, summary.health, sent);
        if (mark !== null) {
          await db.transaction(async (tx) => {
            if (!(await stillFollowed(tx, row.walletId))) return;
            await tx
              .insert(loanAlerts)
              .values({ walletId: row.walletId, userId: row.userId, health: mark, notifiedAt: now })
              .onConflictDoUpdate({ target: loanAlerts.walletId, set: { health: mark, notifiedAt: now } });
          });
        }
      } catch (error: unknown) {
        failed += 1;
        // The user, never the address or the figures.
        /* A loan is the only thing here that can cost somebody money while
             they are not looking, so a pass that could not check one matters
             more than its count suggests. */
        log.error({ userId: row.userId, err: error }, "could not check a loan");
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, owing.length) }, worker));

  /*
   * Then each loan's history, where something may have happened that Mercury
   * did not build. A liquidation found there is written to the ledger and the
   * feed, booked as a sale, put in the inbox and mailed (`readLoanHistory`).
   * A loan whose history could not be read is tried again next pass: what it
   * saw is not remembered, so the same drop still reads as one.
   */
  let liquidations = 0;
  const history = deps.loanHistory;
  if (history !== undefined) {
    const due = withLoan.filter(({ row, position }) =>
      historyDue(memory, row.walletId, position, toldBefore.get(row.walletId) ?? null, now.getTime()),
    );
    for (const { row, position } of withLoan) {
      if (!due.some((d) => d.row.walletId === row.walletId)) remember(memory, row.walletId, position);
    }
    let at = 0;
    const reader = async (): Promise<void> => {
      for (;;) {
        const item = due[at++];
        if (item === undefined) return;
        const { row, position } = item;
        try {
          const r = await readLoanHistory(
            {
              db,
              lending: deps.lending,
              loans: history.loans,
              market: history.market,
              usdcMint: deps.usdcMint,
              notifier: deps.notifier,
              now: () => now,
            },
            { userId: row.userId, walletId: row.walletId, address: row.address },
          );
          if (r.kind === "unavailable") continue;
          if (r.kind === "read") liquidations += r.liquidations;
          remember(memory, row.walletId, position);
          memory.readAt.set(row.walletId, now.getTime());
        } catch (error: unknown) {
          failed += 1;
          log.error({ userId: row.userId, err: error }, "could not read a loan's history");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, reader));
  }

  return { loans, alerted, delivered, failed, liquidations };
}
