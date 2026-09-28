import { and, eq, gte, sql } from "drizzle-orm";
import type { SupportedStocks } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { instruments, orders, tokens } from "../db/schema.js";
import type { StockRow } from "../routes/instruments.js";

/**
 * The stored stocks, with the live registry figures folded in: holders,
 * pool depth, volume, net buyers, traders, the icon, and whether Jupiter has a
 * market for the token at all.
 *
 * None of these is a column: they move every hour and nothing decides anything
 * from a stored copy of them. They come from the registry,
 * which caches the universe for an hour, so this costs one upstream call an hour
 * rather than one per request. If the registry is unreachable the counts are
 * zero and the popular shelf falls back to alphabetical — a worse shelf, not a
 * broken one. Pricing still runs, because a missing registry does not stop
 * price/v3 answering; `hasMarket` defaults to true so it gets asked.
 */
export async function readSupportedStocks(
  db: Db,
  supportedStocks: SupportedStocks,
): Promise<readonly StockRow[]> {
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
    supportedStocks.instruments().catch(() => []),
  ]);

  const liveByMint = new Map(live.flatMap((i) => i.wrappers.map((w) => [w.mint, w] as const)));

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
        holders: liveByMint.get(w.mint)?.holders ?? 0,
        icon: liveByMint.get(w.mint)?.icon ?? null,
        liquidityUsd: liveByMint.get(w.mint)?.liquidityUsd.toFixed() ?? "0",
        volume24hUsd: liveByMint.get(w.mint)?.volume24hUsd.toFixed() ?? "0",
        netBuyers24h: liveByMint.get(w.mint)?.netBuyers24h ?? 0,
        traders24h: liveByMint.get(w.mint)?.traders24h ?? 0,
        hasMarket: liveByMint.get(w.mint)?.hasMarket ?? true,
      })),
  }));
}

/**
 * Distinct accounts that filled a buy of this instrument in the last thirty days.
 *
 * This reads zero until subsystem 3 writes a fill, and zero is the true answer
 * in the meantime — the UI shows nothing rather than a number nobody has
 * earned. It was the last figure on that page invented from a hash of the
 * ticker; the rest now come from real price history.
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
