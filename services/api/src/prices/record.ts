import { and, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { toWire } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import type { Db } from "../db/client.js";
import { priceBars, tokens } from "../db/schema.js";
import { WIDTHS, bucketOf, samplesFrom, type Sample, type Width } from "./bars.js";

export interface RecordSummary {
  /** Tokens that got a sample. Each one touched a bar at every width. */
  readonly samples: number;
}

/**
 * The oldest price the recorder will take from the board: its own freshness
 * window. Well inside a minute bar, and old enough that a price another reader
 * fetched a moment ago is used rather than asked for again.
 */
export const RECORD_MAX_AGE_MS = 5_000;

/** How long a minute bar is kept. An hour or a day is kept for good. ADR 0016. */
export const MINUTE_BARS_KEPT_MS = 30 * 24 * 3_600_000;

const rowOf = (s: Sample, width: Width) => {
  const market = toWire(s.marketPerShare);
  const reference = s.referencePerShare === null ? null : toWire(s.referencePerShare);
  return {
    tokenId: s.tokenId,
    width,
    bucketStart: bucketOf(s.at, width),
    marketOpen: market,
    marketHigh: market,
    marketLow: market,
    marketClose: market,
    referenceOpen: reference,
    referenceHigh: reference,
    referenceLow: reference,
    referenceClose: reference,
    multiplier: toWire(s.multiplier),
    liquidityUsd: toWire(s.liquidityUsd),
    samples: 1,
    firstAt: s.at,
    lastAt: s.at,
  };
};

/*
 * How a sample folds into a bar that already exists.
 *
 * Qualified by hand because both rows are in scope inside `on conflict`: the
 * stored one by the table's name, the incoming one as `excluded`. Each sees the
 * stored row as it was before this statement, so the order of the clauses
 * does not matter.
 *
 * Open and close go by the instant of the sample, not the order rows reach the
 * database, so a sample that arrives late — two containers overlapping through
 * a deploy — widens the bar without becoming its close. And a null, which is
 * a quote that was not published, never replaces one that was.
 */
const stored = (column: string): SQL => sql.raw(`"price_bar"."${column}"`);
const incoming = (column: string): SQL => sql.raw(`excluded."${column}"`);

const opening = (column: string): SQL =>
  sql`case when ${incoming("first_at")} < ${stored("first_at")}
    then coalesce(${incoming(column)}, ${stored(column)})
    else coalesce(${stored(column)}, ${incoming(column)}) end`;

const closing = (column: string): SQL =>
  sql`case when ${incoming("last_at")} >= ${stored("last_at")}
    then coalesce(${incoming(column)}, ${stored(column)})
    else coalesce(${stored(column)}, ${incoming(column)}) end`;

// `greatest` and `least` skip nulls, which is the rule for a missing quote.
const highest = (column: string): SQL => sql`greatest(${stored(column)}, ${incoming(column)})`;
const lowest = (column: string): SQL => sql`least(${stored(column)}, ${incoming(column)})`;

/**
 * One board's answer, folded into a bar at every width.
 *
 * `at` is when the board answered. The caller asks for a price no older than
 * a few seconds, so a sample is never an entry the board was still serving
 * from a minute ago, stamped with a time it was not true at.
 */
export async function recordPriceBars(
  db: Db,
  board: ReadonlyMap<string, TokenPrice>,
  at: Date,
): Promise<RecordSummary> {
  if (board.size === 0) return { samples: 0 };

  const known = await db
    .select({ id: tokens.id, mint: tokens.mint })
    .from(tokens)
    .where(inArray(tokens.mint, [...board.keys()]));
  const samples = samplesFrom(board, new Map(known.map((t) => [t.mint, t.id])), at);
  if (samples.length === 0) return { samples: 0 };

  await db
    .insert(priceBars)
    .values(samples.flatMap((s) => WIDTHS.map((width) => rowOf(s, width))))
    .onConflictDoUpdate({
      target: [priceBars.tokenId, priceBars.width, priceBars.bucketStart],
      set: {
        marketOpen: opening("market_open"),
        marketHigh: highest("market_high"),
        marketLow: lowest("market_low"),
        marketClose: closing("market_close"),
        referenceOpen: opening("reference_open"),
        referenceHigh: highest("reference_high"),
        referenceLow: lowest("reference_low"),
        referenceClose: closing("reference_close"),
        multiplier: closing("multiplier"),
        liquidityUsd: closing("liquidity_usd"),
        samples: sql`${stored("samples")} + ${incoming("samples")}`,
        firstAt: sql`least(${stored("first_at")}, ${incoming("first_at")})`,
        lastAt: sql`greatest(${stored("last_at")}, ${incoming("last_at")})`,
      },
    });

  return { samples: samples.length };
}

/**
 * Minute bars past thirty days, deleted. Returns how many went.
 *
 * Only minutes: an hour or a day is the history itself, and costs a
 * sixtieth as much to keep.
 */
export async function prunePriceBars(db: Db, now: Date): Promise<number> {
  const before = new Date(now.getTime() - MINUTE_BARS_KEPT_MS);
  const gone = await db
    .delete(priceBars)
    .where(and(eq(priceBars.width, "1m"), lt(priceBars.bucketStart, before)))
    .returning({ tokenId: priceBars.tokenId });
  return gone.length;
}
