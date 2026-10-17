import { asc, eq } from "drizzle-orm";
import { D, toWire, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, loanEvents } from "../db/schema.js";
import type { PlannedLoanEvent } from "./events.js";
import type { LedgerRow } from "./interest.js";

export interface RecordInput {
  readonly userId: string;
  readonly signature: string;
  readonly occurredAt: Date;
  /** Kamino's borrow APY when this landed. Null if the terms could not be read. */
  readonly borrowApy: Decimal | null;
  /** The position straight after, from Kamino. */
  readonly debtAfterUsd: Decimal;
  readonly collateralAfterUsd: Decimal;
  /** The mint each event's asset moved in: USDC for money, the stock for collateral. */
  readonly mintFor: (event: PlannedLoanEvent) => string;
}

/**
 * Write what a lending transaction did, to the ledger and to the feed.
 *
 * Both writes are idempotent by their own unique indexes, so a client that
 * confirms twice — a retry, a double tap, a refresh — adds nothing. That
 * matters more here than for an order: there is no obligation id to check
 * against, so re-confirming is the only recovery a stuck client has.
 *
 * The mint is what makes the activity row idempotent, because the feed's unique
 * index is on (user, signature, mint) and only constrains rows that have one.
 * It is also true: money moved in USDC, collateral moved in the stock. One
 * `deposit_and_borrow` writes two rows under one signature and they do not
 * collide, because they moved different assets.
 */
export async function recordLoanEvents(
  db: Db,
  planned: readonly PlannedLoanEvent[],
  input: RecordInput,
): Promise<{ written: number }> {
  let written = 0;
  for (const event of planned) {
    const inserted = await db
      .insert(loanEvents)
      .values({
        userId: input.userId,
        kind: event.kind,
        usdAmount: event.usdAmount === null ? null : toWire(event.usdAmount),
        ticker: event.ticker,
        tokensRaw: event.tokensRaw,
        borrowApy: input.borrowApy === null ? null : toWire(input.borrowApy),
        debtAfterUsd: toWire(input.debtAfterUsd),
        collateralAfterUsd: toWire(input.collateralAfterUsd),
        txSignature: input.signature,
        occurredAt: input.occurredAt,
      })
      .onConflictDoNothing()
      .returning({ id: loanEvents.id });

    // The feed row follows the ledger row: if this event was already recorded,
    // its row is already in the feed and writing again would only risk a second.
    if (inserted.length === 0) continue;

    await db
      .insert(activities)
      .values({
        userId: input.userId,
        kind: event.kind,
        occurredAt: input.occurredAt,
        title: event.title,
        subtitle: event.subtitle,
        amountUsd: event.usdAmount === null ? null : toWire(event.usdAmount),
        refTable: "loan_event",
        txSignature: input.signature,
        mint: input.mintFor(event),
      })
      .onConflictDoNothing();
    written += 1;
  }
  return { written };
}

/**
 * A borrower's loan events, oldest first: what `outstandingPrincipal` reads to
 * tell the interest apart from what was borrowed.
 *
 * Ordered by when each happened, not when it was confirmed, because confirms
 * arrive late and out of order — a retried one can land a day after the repay
 * that followed it.
 */
export async function loanLedger(db: Db, userId: string): Promise<readonly LedgerRow[]> {
  const rows = await db
    .select({ kind: loanEvents.kind, usdAmount: loanEvents.usdAmount, debtAfterUsd: loanEvents.debtAfterUsd })
    .from(loanEvents)
    .where(eq(loanEvents.userId, userId))
    .orderBy(asc(loanEvents.occurredAt), asc(loanEvents.recordedAt));
  return rows.map((r) => ({
    kind: r.kind,
    usdAmount: r.usdAmount === null ? null : D(r.usdAmount),
    debtAfterUsd: D(r.debtAfterUsd),
  }));
}
