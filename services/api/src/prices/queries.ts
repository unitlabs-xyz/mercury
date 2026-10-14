import { and, asc, eq, gte, lt } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { priceBars } from "../db/schema.js";
import type { Width } from "./bars.js";

export interface Ohlc {
  readonly open: Decimal;
  readonly high: Decimal;
  readonly low: Decimal;
  readonly close: Decimal;
}

/** One `price_bar` row, in the units the rest of the code works in. */
export interface PriceBar {
  readonly bucketStart: Date;
  /** What one share of the wrapper fetched in the pool. */
  readonly market: Ohlc;
  /** The issuer's quote for one real share. Null across a bar that never had one. */
  readonly reference: Ohlc | null;
  readonly multiplier: Decimal;
  readonly liquidityUsd: Decimal;
  readonly samples: number;
}

/**
 * One token's bars of one width whose start is in [from, to), oldest first.
 *
 * The window is over bar starts, so a bar is in or out whole. A bar is never
 * cut to the window, because the part of it outside was never stored apart.
 */
export async function barsFor(
  db: Db,
  tokenId: string,
  width: Width,
  from: Date,
  to: Date,
): Promise<readonly PriceBar[]> {
  const rows = await db
    .select()
    .from(priceBars)
    .where(
      and(
        eq(priceBars.tokenId, tokenId),
        eq(priceBars.width, width),
        gte(priceBars.bucketStart, from),
        lt(priceBars.bucketStart, to),
      ),
    )
    .orderBy(asc(priceBars.bucketStart));

  return rows.map((r) => ({
    bucketStart: r.bucketStart,
    market: { open: D(r.marketOpen), high: D(r.marketHigh), low: D(r.marketLow), close: D(r.marketClose) },
    // Written together and folded together, so the four are null together.
    reference:
      r.referenceOpen === null ||
      r.referenceHigh === null ||
      r.referenceLow === null ||
      r.referenceClose === null
        ? null
        : {
            open: D(r.referenceOpen),
            high: D(r.referenceHigh),
            low: D(r.referenceLow),
            close: D(r.referenceClose),
          },
    multiplier: D(r.multiplier),
    liquidityUsd: D(r.liquidityUsd),
    samples: r.samples,
  }));
}
