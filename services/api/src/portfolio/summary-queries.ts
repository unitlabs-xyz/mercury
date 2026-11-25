import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import {
  activities,
  disposals,
  earnEvents,
  historyJobs,
  loanAlerts,
  loanEvents,
  orders,
  portfolioSnapshots,
} from "../db/schema.js";
import type { PriceBoard } from "@mercury/market";
import type { PortfolioSummary } from "@mercury/types";
import type { LedgerRow } from "../lending/interest.js";
import { followedWallets } from "../wallets/acting.js";
import { readHoldings } from "./queries.js";
import { summarise, type WalletRecords } from "./summary.js";

/** The summary's records for each wallet, by id, less the holdings, which `readHoldings` reads. */
export type SummaryRecords = Omit<WalletRecords, "holdings">;

/** Each wallet's total, adding up every row given for it. */
const sums = (rows: readonly { walletId: string; total: string | null }[]) => {
  const out = new Map<string, Decimal>();
  for (const r of rows) out.set(r.walletId, (out.get(r.walletId) ?? D(0)).add(D(r.total ?? "0")));
  return out;
};

/**
 * One query per ledger, each across every wallet at once, so the summary costs
 * the same few queries however many wallets are linked. None of it reads the chain.
 */
export async function readSummaryRecords(
  db: Db,
  userId: string,
  walletIds: readonly string[],
): Promise<ReadonlyMap<string, SummaryRecords>> {
  if (walletIds.length === 0) return new Map();
  const ids = [...walletIds];

  const [latest, realised, liquidated, soldElsewhere, dividends, earnNet, ledger, alerts, read] =
    await Promise.all([
      // Each wallet's newest reading: one row per wallet, newest first within it.
      db
        .selectDistinctOn([portfolioSnapshots.walletId], {
          walletId: portfolioSnapshots.walletId,
          capturedAt: portfolioSnapshots.capturedAt,
          readAt: portfolioSnapshots.readAt,
          totalUsd: portfolioSnapshots.totalUsd,
          debtUsd: portfolioSnapshots.debtUsd,
          earnUsd: portfolioSnapshots.earnUsd,
        })
        .from(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.userId, userId), inArray(portfolioSnapshots.walletId, ids)))
        .orderBy(portfolioSnapshots.walletId, desc(portfolioSnapshots.capturedAt)),
      db
        .select({
          walletId: sql<string>`${orders.walletId}`,
          total: sql<string | null>`sum(${orders.realisedPnlUsd})`,
        })
        .from(orders)
        .where(
          and(eq(orders.userId, userId), inArray(orders.walletId, ids), isNotNull(orders.realisedPnlUsd)),
        )
        .groupBy(orders.walletId),
      // A liquidation is a sale too: Kamino sold the shares, and the money cleared the debt.
      db
        .select({
          walletId: loanEvents.walletId,
          total: sql<string | null>`sum(${loanEvents.realisedPnlUsd})`,
        })
        .from(loanEvents)
        .where(
          and(
            eq(loanEvents.userId, userId),
            inArray(loanEvents.walletId, ids),
            isNotNull(loanEvents.realisedPnlUsd),
          ),
        )
        .groupBy(loanEvents.walletId),
      // And a sale made outside Mercury, found in a linked wallet's history, where it was swapped for dollars.
      db
        .select({ walletId: disposals.walletId, total: sql<string | null>`sum(${disposals.realisedPnlUsd})` })
        .from(disposals)
        .where(
          and(
            eq(disposals.userId, userId),
            inArray(disposals.walletId, ids),
            isNotNull(disposals.realisedPnlUsd),
          ),
        )
        .groupBy(disposals.walletId),
      db
        .select({ walletId: activities.walletId, total: sql<string | null>`sum(${activities.amountUsd})` })
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            inArray(activities.walletId, ids),
            eq(activities.kind, "dividend"),
            isNotNull(activities.amountUsd),
          ),
        )
        .groupBy(activities.walletId),
      db
        .select({
          walletId: earnEvents.walletId,
          total: sql<
            string | null
          >`sum(case when ${earnEvents.kind} = 'deposit' then ${earnEvents.usdcAmount} else -${earnEvents.usdcAmount} end)`,
          estimated: sql<boolean>`bool_or(${earnEvents.estimated})`,
        })
        .from(earnEvents)
        .where(and(eq(earnEvents.userId, userId), inArray(earnEvents.walletId, ids)))
        .groupBy(earnEvents.walletId),
      db
        .select({
          walletId: loanEvents.walletId,
          kind: loanEvents.kind,
          usdAmount: loanEvents.usdAmount,
          debtAfterUsd: loanEvents.debtAfterUsd,
          occurredAt: loanEvents.occurredAt,
        })
        .from(loanEvents)
        .where(and(eq(loanEvents.userId, userId), inArray(loanEvents.walletId, ids)))
        .orderBy(asc(loanEvents.occurredAt), asc(loanEvents.recordedAt)),
      db
        .select({ walletId: loanAlerts.walletId, health: loanAlerts.health })
        .from(loanAlerts)
        .where(inArray(loanAlerts.walletId, ids)),
      db
        .select({ walletId: historyJobs.walletId })
        .from(historyJobs)
        .where(and(inArray(historyJobs.walletId, ids), eq(historyJobs.status, "done"))),
    ]);

  const latestBy = new Map(latest.map((r) => [r.walletId, r]));
  const realisedBy = sums([...realised, ...liquidated, ...soldElsewhere]);
  const dividendsBy = sums(dividends);
  const earnBy = sums(earnNet);
  const healthBy = new Map(alerts.map((a) => [a.walletId, a.health]));
  const readSet = new Set(read.map((r) => r.walletId));
  const ledgerBy = new Map<string, LedgerRow[]>();
  for (const r of ledger) {
    const row: LedgerRow = {
      kind: r.kind,
      usdAmount: r.usdAmount === null ? null : D(r.usdAmount),
      debtAfterUsd: D(r.debtAfterUsd),
      at: r.occurredAt,
    };
    const rows = ledgerBy.get(r.walletId);
    if (rows === undefined) ledgerBy.set(r.walletId, [row]);
    else rows.push(row);
  }

  const zero = (m: ReadonlyMap<string, Decimal>, id: string) => m.get(id) ?? D(0);
  return new Map(
    ids.map((id): [string, SummaryRecords] => {
      const l = latestBy.get(id);
      return [
        id,
        {
          latest:
            l === undefined
              ? null
              : {
                  totalUsd: D(l.totalUsd),
                  debtUsd: D(l.debtUsd),
                  earnUsd: l.earnUsd === null ? null : D(l.earnUsd),
                  asOf: l.readAt ?? l.capturedAt,
                },
          realisedUsd: zero(realisedBy, id),
          dividendsUsd: zero(dividendsBy, id),
          earnNetDepositedUsd: earnBy.get(id) ?? null,
          earnEstimated: earnNet.some((r) => r.walletId === id && r.estimated === true),
          loanLedger: ledgerBy.get(id) ?? [],
          loanHealth: healthBy.get(id) ?? null,
          historyRead: readSet.has(id),
        },
      ];
    }),
  );
}

/**
 * The summary for everyone's every followed wallet, whichever is chosen: it
 * is the whole account by definition. Records from the database and prices
 * from the board, which is held in memory; nothing here reads the chain.
 */
export async function readSummary(db: Db, prices: PriceBoard, userId: string): Promise<PortfolioSummary> {
  const wallets = await followedWallets(db, userId);
  const [records, holdings] = await Promise.all([
    readSummaryRecords(
      db,
      userId,
      wallets.map((w) => w.id),
    ),
    Promise.all(wallets.map((w) => readHoldings(db, userId, w.id))),
  ]);
  const mints = [...new Set(holdings.flat().flatMap((r) => r.wrappers.map((w) => w.mint)))];
  const board = mints.length === 0 ? new Map() : await prices.pricesFor(mints);
  return summarise(
    wallets.map((wallet, i) => ({ wallet, records: { ...records.get(wallet.id)!, holdings: holdings[i]! } })),
    board,
  );
}
