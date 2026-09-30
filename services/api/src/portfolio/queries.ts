import { and, asc, eq, gte } from "drizzle-orm";
import { D } from "@mercury/core";
import type { Db } from "../db/client.js";
import { instruments, portfolioSnapshots, positions, tokens } from "../db/schema.js";
import type { HoldingRow } from "../routes/portfolio.js";
import type { Reading } from "./history.js";

/**
 * Every instrument the user has a position row for, with the wrappers that
 * belong to it. One query plus one, rather than a join that would repeat the
 * position across its wrappers and have to be folded back up.
 */
export async function readHoldings(db: Db, userId: string): Promise<readonly HoldingRow[]> {
  const rows = await db
    .select({
      instrumentId: positions.instrumentId,
      ticker: instruments.ticker,
      name: instruments.name,
      shares: positions.shares,
      sharesWithBasis: positions.sharesWithBasis,
      costBasisUsd: positions.costBasisUsd,
      avgUnitCostUsd: positions.avgUnitCostUsd,
    })
    .from(positions)
    .innerJoin(instruments, eq(instruments.id, positions.instrumentId))
    .where(eq(positions.userId, userId));

  if (rows.length === 0) return [];

  const wrappers = await db
    .select({
      instrumentId: tokens.instrumentId,
      mint: tokens.mint,
      symbol: tokens.symbol,
      issuer: tokens.issuer,
      decimals: tokens.decimals,
    })
    .from(tokens);

  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    ticker: row.ticker,
    name: row.name,
    shares: D(row.shares),
    sharesWithBasis: D(row.sharesWithBasis),
    costBasisUsd: D(row.costBasisUsd),
    avgUnitCostUsd: D(row.avgUnitCostUsd),
    wrappers: wrappers
      .filter((w) => w.instrumentId === row.instrumentId)
      .map((w) => ({ mint: w.mint, symbol: w.symbol, issuer: w.issuer, decimals: w.decimals })),
  }));
}

/**
 * The account's hourly readings since `from`, oldest first.
 *
 * A month is 720 rows at most, so the range is bounded by the query rather
 * than by a limit: a cap would silently drop the oldest end of the line, which
 * is the end a chart is for.
 */
export async function readSnapshots(db: Db, userId: string, from: Date): Promise<readonly Reading[]> {
  const rows = await db
    .select({ at: portfolioSnapshots.capturedAt, totalUsd: portfolioSnapshots.totalUsd })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.capturedAt, from)))
    .orderBy(asc(portfolioSnapshots.capturedAt));
  return rows.map((r) => ({ at: r.at, totalUsd: D(r.totalUsd) }));
}
