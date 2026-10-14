import type { Decimal } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import { marketPricePerShare } from "../portfolio/value.js";

/**
 * How wide a bar is. Three, and only three: a minute for a day's chart, an
 * hour for a month's, a day for everything longer. See ADR 0016.
 */
export type Width = "1m" | "1h" | "1d";

export const WIDTHS: readonly Width[] = ["1m", "1h", "1d"];

const MS: Record<Width, number> = {
  "1m": 60_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

/** The start of the bar a moment falls in. UTC throughout, a day included. */
export const bucketOf = (at: Date, width: Width): Date =>
  new Date(Math.floor(at.getTime() / MS[width]) * MS[width]);

/** One token's prices at one moment, as a bar is built from them. */
export interface Sample {
  readonly tokenId: string;
  readonly at: Date;
  /**
   * What one share of this wrapper fetches in the pool. Per share rather than
   * per token, so a dividend, which raises the multiplier and with it the
   * token's price, is not drawn as a jump in the stock.
   */
  readonly marketPerShare: Decimal;
  /** The issuer's quote for one real share. Null when none was published. */
  readonly referencePerShare: Decimal | null;
  readonly multiplier: Decimal;
  readonly liquidityUsd: Decimal;
}

/**
 * One board's answer, as samples taken at `at`.
 *
 * The market price is `marketPricePerShare`, the same function the portfolio
 * is valued with, so a value rebuilt from these bars is the value the page
 * showed at the time.
 */
export const samplesFrom = (
  board: ReadonlyMap<string, TokenPrice>,
  tokenIds: ReadonlyMap<string, string>,
  at: Date,
): Sample[] =>
  [...board.values()].flatMap((price) => {
    const tokenId = tokenIds.get(price.mint);
    if (tokenId === undefined) return [];
    const marketPerShare = marketPricePerShare(price);
    if (marketPerShare.lte(0)) return [];
    return [
      {
        tokenId,
        at,
        marketPerShare,
        referencePerShare: price.pricePerShare,
        multiplier: price.multiplier,
        liquidityUsd: price.liquidityUsd,
      },
    ];
  });
