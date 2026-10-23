import { eq } from "drizzle-orm";
import { logger } from "../log/index.js";
import type { Db } from "../db/client.js";
import { activities, loanAlerts, users, wallets } from "../db/schema.js";
import type { Notifier } from "../notify/ports.js";
import { capacity } from "./capacity.js";
import { capacityInputFor } from "./input.js";
import type { LendingSource } from "./ports.js";
import type { ChainReader } from "@mercury/chain";
import { alertFor, markAfter } from "./watch.js";
import type { Health } from "./capacity.js";

const log = logger("loan-watch");

export interface WatchDeps {
  readonly lending: LendingSource;
  readonly chain: ChainReader;
  readonly usdcMint: string;
  readonly notifier: Notifier;
}

export interface WatchSummary {
  readonly loans: number;
  readonly alerted: number;
  readonly delivered: number;
  readonly failed: number;
}

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
export async function watchAllLoans(db: Db, deps: WatchDeps, now: Date): Promise<WatchSummary> {
  const rows = await db
    .select({ userId: users.id, email: users.email, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.isPrimary, true));

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
  const loaded = await Promise.allSettled(rows.map((row) => deps.lending.position(row.address)));
  loaded.forEach((result, i) => {
    const row = rows[i]!;
    if (result.status === "rejected") {
      failed += 1;
      log.error({ userId: row.userId, err: result.reason }, "could not check a loan");
    } else if (result.value !== null && !result.value.debtUsd.isZero()) {
      owing.push(row);
    }
  });

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
          .select({ health: loanAlerts.health })
          .from(loanAlerts)
          .where(eq(loanAlerts.userId, row.userId));
        const told = (existing?.health ?? null) as Health | null;

        const alert = alertFor(told, summary);
        if (alert === null) {
          // Still record a return to health, so a relapse is worth saying again.
          if (told !== null && summary.health === "healthy") {
            await db
              .insert(loanAlerts)
              .values({ userId: row.userId, health: "healthy", notifiedAt: now })
              .onConflictDoUpdate({
                target: loanAlerts.userId,
                set: { health: "healthy", notifiedAt: now },
              });
          }
          continue;
        }

        alerted += 1;

        /*
         * The feed row is written whether or not the mail lands, and it is
         * written first. It is the copy we control: a provider can be down and
         * an address can be wrong, but somebody who opens the app will see
         * this. The mail is what reaches somebody who does not open the app,
         * which is the harder and more important half.
         */
        await db
          .insert(activities)
          .values({
            userId: row.userId,
            kind: "loan_alert",
            occurredAt: now,
            title: alert.title,
            subtitle: alert.body,
            mint: null,
          })
          .onConflictDoNothing();

        const sent = row.email === null ? false : await deps.notifier.send({ to: row.email, ...alert });
        if (sent) delivered += 1;

        const mark = markAfter(told, summary.health, sent);
        if (mark !== null) {
          await db
            .insert(loanAlerts)
            .values({ userId: row.userId, health: mark, notifiedAt: now })
            .onConflictDoUpdate({ target: loanAlerts.userId, set: { health: mark, notifiedAt: now } });
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

  return { loans, alerted, delivered, failed };
}
