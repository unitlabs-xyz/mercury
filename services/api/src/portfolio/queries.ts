import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import type { Db } from "../db/client.js";
import { instruments, positions, tokens } from "../db/schema.js";
import type { HoldingRow } from "../routes/portfolio.js";

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
    costBasisUsd: D(row.costBasisUsd),
    avgUnitCostUsd: D(row.avgUnitCostUsd),
    wrappers: wrappers
      .filter((w) => w.instrumentId === row.instrumentId)
      .map((w) => ({ mint: w.mint, symbol: w.symbol, issuer: w.issuer, decimals: w.decimals })),
  }));
}
