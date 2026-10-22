import { eq } from "drizzle-orm";
import { logger } from "../log/index.js";
import { toWire, ZERO, type Decimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { portfolioSnapshots, users, wallets } from "../db/schema.js";
import { hourOf } from "./history.js";
import { cashFrom, valuePortfolio, type ValuableHolding } from "./value.js";
import type { BasketValueReader } from "./baskets.js";

const log = logger("portfolio-snapshot");

export interface SnapshotDeps {
  readonly holdings: (userId: string) => Promise<readonly ValuableHolding[]>;
  /** Owed to Kamino. Null when Kamino could not be read, which costs this account its reading. */
  readonly debt: (walletAddress: string) => Promise<Decimal | null>;
  readonly prices: PriceBoard;
  readonly chain: ChainReader;
  readonly usdcMint: string;
  readonly baskets: BasketValueReader;
  /** USDC in the Earn vault. Throws when unreadable, which costs this account its reading. */
  readonly earn?: (walletAddress: string) => Promise<Decimal>;
}

export interface SnapshotSummary {
  readonly wallets: number;
  readonly written: number;
  readonly failed: number;
}

/** As position-sync: enough in flight to batch, few enough that the node keeps the connections. */
const CONCURRENCY = 8;

/**
 * What every account is worth, written once an hour.
 *
 * This is the only table in the system whose value is that it is old. Nothing
 * else records history — a position is overwritten as the chain moves, and a
 * price board is spot — so a reading missed is a gap in the chart forever,
 * which is why an account that cannot be read costs only its own row.
 *
 * An empty account is recorded as zero rather than skipped. A line that starts
 * the day someone's first deposit lands is the line they want to see; one that
 * starts at their first deposit's value has no beginning to measure from.
 */
export async function snapshotAllPortfolios(db: Db, deps: SnapshotDeps, now: Date): Promise<SnapshotSummary> {
  const rows = await db
    .select({ userId: users.id, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.isPrimary, true));

  const capturedAt = hourOf(now);
  let written = 0;
  let failed = 0;

  // A shared index rather than a chunked split, so a slow wallet holds up only
  // itself. Counters are safe to share: this runs on one thread.
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const row = rows[next++];
      if (row === undefined) return;
      try {
        const [held, debtUsd, basketValue, earnUsd] = await Promise.all([
          deps.holdings(row.userId),
          deps.debt(row.address),
          deps.baskets(row.userId, row.address),
          // Unreadable throws, and the reading is skipped, for the reason below.
          deps.earn?.(row.address) ?? ZERO,
        ]);
        /*
         * A reading with unknown debt is not a reading. Every other job can
         * catch up after an outage; this one cannot, because an hour not
         * recorded is a hole in the chart forever. But a gross total written
         * into a net column is worse than a hole: the hole is visibly missing
         * and the wrong number is not, and it would sit in the history being
         * quietly wrong long after Kamino came back.
         */
        if (debtUsd === null) throw new Error("debt unreadable; skipping this reading");

        const [board, balances] = await Promise.all([
          deps.prices.pricesFor(held.flatMap((h) => h.wrappers.map((w) => w.mint))),
          // Finalized: an hourly reading is kept forever and has no use for
          // the fresher answer.
          deps.chain.tokenBalances(row.address, "finalized"),
        ]);
        const value = valuePortfolio(
          held,
          board,
          cashFrom(balances, deps.usdcMint),
          debtUsd,
          basketValue.totalUsd,
          earnUsd,
        );
        await db
          .insert(portfolioSnapshots)
          .values({
            userId: row.userId,
            capturedAt,
            readAt: now,
            totalUsd: toWire(value.totalUsd),
            stocksUsd: toWire(value.stocksUsd),
            cashUsd: toWire(value.cashUsd),
            basketUsd: toWire(value.basketUsd),
            debtUsd: toWire(value.debtUsd),
            earnUsd: toWire(value.earnUsd),
          })
          // A deploy mid-hour re-reads the same hour. The later reading is the
          // better one — it is closer to the top of the next hour — so it wins.
          .onConflictDoUpdate({
            target: [portfolioSnapshots.userId, portfolioSnapshots.capturedAt],
            set: {
              readAt: now,
              totalUsd: toWire(value.totalUsd),
              stocksUsd: toWire(value.stocksUsd),
              cashUsd: toWire(value.cashUsd),
              basketUsd: toWire(value.basketUsd),
              debtUsd: toWire(value.debtUsd),
              earnUsd: toWire(value.earnUsd),
            },
          });
        written += 1;
      } catch (error: unknown) {
        failed += 1;
        // The wallet, never the address: an address in a log is a person's
        // holdings in a log.
        /* The only reading of what an account was worth at this hour, and
             nothing can reconstruct one that was never taken. */
        log.error({ userId: row.userId, err: error }, "snapshot failed for a wallet");
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  return { wallets: rows.length, written, failed };
}
