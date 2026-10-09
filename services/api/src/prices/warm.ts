import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import type { PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { lots, tokens } from "../db/schema.js";
import { FEATURED_LIQUIDITY_USD, type StockRow } from "../routes/instruments.js";

export interface WarmDeps {
  /** The same reader the shelf uses, so the warm set and the shelf cannot diverge. */
  readonly supportedStocks: () => Promise<readonly StockRow[]>;
  readonly prices: PriceBoard;
}

export interface WarmSummary {
  readonly mints: number;
  /** How many of them Jupiter had a price for. Short of `mints` is worth seeing. */
  readonly priced: number;
}

/**
 * Every mint anyone has ever held.
 *
 * A superset of what `position-sync` asks about, except for a token that
 * arrived by transfer and has no lot yet — that one is warmed from its first
 * pass onward. Warming a mint somebody has since sold out of costs nothing,
 * because it rides a batch that was going out anyway.
 */
const heldMints = async (db: Db): Promise<readonly string[]> => {
  const rows = await db
    .select({ mint: tokens.mint })
    .from(lots)
    .innerJoin(tokens, eq(tokens.id, lots.tokenId));
  return [...new Set(rows.map((r) => r.mint))];
};

const mintsOf = (rows: readonly StockRow[]): readonly string[] =>
  rows.flatMap((r) => r.wrappers.filter((w) => w.hasMarket).map((w) => w.mint));

/**
 * Keeps the prices somebody is about to want already in the board.
 *
 * Two sets, and only two. What anybody holds, because `position-sync` reads it
 * every two seconds and used to go upstream once per wallet to do so — the one
 * cost in the system that grew with the number of accounts. And the featured
 * shelf, because that is what a first visit renders before it has been told
 * what to look at.
 *
 * It deliberately does not warm the universe. Of 468 priceable tickers, 21 are
 * featured — 41 mints, which is one request; the other 447 appear only in a
 * search result, and the board's stale-while-revalidate keeps each one warm for
 * exactly as long as somebody keeps looking at it. Warming all of them would be
 * twelve requests a pass against a keyless allowance of thirty a minute, spent
 * almost entirely on tickers nobody opened.
 *
 * Nothing here writes anything down, and there is no second cache: it fills the
 * one board every reader already shares.
 */
export async function warmPrices(db: Db, deps: WarmDeps): Promise<WarmSummary> {
  const [rows, held] = await Promise.all([deps.supportedStocks(), heldMints(db)]);

  const featured = mintsOf(
    rows.filter((r) => r.isTradable && r.wrappers.some((w) => D(w.liquidityUsd).gte(FEATURED_LIQUIDITY_USD))),
  );
  // A held mint Jupiter has no market for would be an id wasted in every batch,
  // and `price/v3` answers at most fifty of them at a time.
  const priceable = new Set(mintsOf(rows));
  const warm = [...new Set([...featured, ...held.filter((mint) => priceable.has(mint))])];

  if (warm.length === 0) return { mints: 0, priced: 0 };
  const board = await deps.prices.pricesFor(warm);
  return { mints: warm.length, priced: board.size };
}
