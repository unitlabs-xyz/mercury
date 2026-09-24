import { and, eq, gte, sql } from "drizzle-orm";
import type { CatalogueSource } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { instruments, orders, tokens } from "../db/schema.js";
import type { CatalogueRow } from "../routes/instruments.js";

/**
 * The stored catalogue, with live holder counts folded in.
 *
 * Holder counts are deliberately not a column: they move every hour and nothing
 * decides anything from a stored copy of them. They come from the registry,
 * which caches the universe for an hour, so this costs one upstream call an hour
 * rather than one per request. If the registry is unreachable the counts are
 * zero and the popular shelf falls back to alphabetical — a worse shelf, not a
 * broken one.
 */
export async function readCatalogue(db: Db, catalogue: CatalogueSource): Promise<readonly CatalogueRow[]> {
  const [rows, live] = await Promise.all([
    db
      .select({
        ticker: instruments.ticker,
        name: instruments.name,
        sector: instruments.sector,
        description: instruments.description,
        logoUrl: instruments.logoUrl,
        isTradable: instruments.isTradable,
        instrumentId: instruments.id,
      })
      .from(instruments),
    catalogue.instruments().catch(() => []),
  ]);

  const holdersByMint = new Map(
    live.flatMap((i) => i.wrappers.map((w) => [w.mint, w.holders] as const)),
  );

  const wrappers = await db
    .select({
      instrumentId: tokens.instrumentId,
      mint: tokens.mint,
      symbol: tokens.symbol,
      issuer: tokens.issuer,
      decimals: tokens.decimals,
      multiplier: tokens.multiplier,
      isRoutable: tokens.isRoutable,
    })
    .from(tokens);

  return rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    description: row.description,
    logoUrl: row.logoUrl,
    isTradable: row.isTradable,
    wrappers: wrappers
      .filter((w) => w.instrumentId === row.instrumentId)
      .map((w) => ({
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        decimals: w.decimals,
        multiplier: w.multiplier,
        isRoutable: w.isRoutable,
        holders: holdersByMint.get(w.mint) ?? 0,
      })),
  }));
}

/**
 * Distinct accounts that filled a buy of this instrument in the last thirty days.
 *
 * `apps/web/src/market/placeholder.ts` invents this number today, and says in its
 * own header that it needs our order table. This is that table. It reads zero
 * until subsystem 3 writes a fill, and zero is the true answer in the meantime —
 * the UI should show nothing rather than a number nobody has earned.
 */
export async function countBuyers30d(db: Db, ticker: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ buyers: sql<string>`count(distinct ${orders.userId})` })
    .from(orders)
    .innerJoin(instruments, eq(instruments.id, orders.instrumentId))
    .where(
      and(
        eq(instruments.ticker, ticker),
        eq(orders.side, "buy"),
        eq(orders.status, "filled"),
        gte(orders.filledAt, since),
      ),
    );
  return row === undefined ? 0 : Number(row.buyers);
}
