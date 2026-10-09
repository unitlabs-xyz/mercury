import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities, loanAlerts, users, wallets } from "../db/schema.js";
import type { Notifier } from "../notify/ports.js";
import { capacity } from "./capacity.js";
import { capacityInputFor } from "./input.js";
import type { LendingSource } from "./ports.js";
import type { ChainReader } from "@mercury/chain";
import { alertFor, markAfter } from "./watch.js";
import type { Health } from "./capacity.js";

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

  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const row = rows[next++];
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
        console.error(`loan-watch: could not check the loan for user ${row.userId}`, error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  return { loans, alerted, delivered, failed };
}
