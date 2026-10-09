import { ZERO, type ReferencePrice } from "@mercury/core";
import type { TokenRegistry } from "@mercury/chain";
import type { PriceAsk, PriceBoard, ReferenceSource } from "./ports.js";

export interface ReferenceRead {
  readonly registry: TokenRegistry;
  readonly board: PriceBoard;
  readonly now: () => number;
  /** What the board is held to. Omitted, its own window decides. */
  readonly ask?: PriceAsk;
}

/**
 * One real share's price, taken from the Backed wrapper where there is one.
 *
 * Both issuers wrap the same company, so either would do; Backed is preferred
 * because its pools are the deep ones and its feed is the one that keeps
 * updating.
 *
 * A free function because two things need it and neither should own it:
 * `JupiterMarket`, which prices from its own requests, and `BoardReference`,
 * which prices from a board shared with everything else in the server.
 */
export const referenceFrom = async (read: ReferenceRead, ticker: string): Promise<ReferencePrice | null> => {
  const wrappers = await read.registry.wrappersFor(ticker);
  if (wrappers.length === 0) return null;

  const board = await read.board.pricesFor(
    wrappers.map((w) => w.mint),
    read.ask,
  );
  const preferred = wrappers.find((w) => w.issuer === "backed") ?? wrappers[0]!;
  const price = board.get(preferred.mint) ?? [...board.values()][0];
  if (price === undefined || price.pricePerShare === null) return null;

  return {
    pricePerShare: price.pricePerShare,
    observedAt: price.observedAt ?? new Date(read.now()),
    // A dividend that has gone ex but is not yet folded into the multiplier.
    // No upstream we read publishes one, so it is zero and honestly so.
    pendingDividendNet: ZERO,
  };
};

export interface BoardReferenceConfig {
  readonly registry: TokenRegistry;
  readonly board: PriceBoard;
  /**
   * The oldest price a quote may be checked against.
   *
   * The reference is not a figure on a screen: `decide` compares the route's
   * price to it and refuses an order that is too far above. Sharing the
   * board's full window would check a live quote against a price up to that
   * long out of date, so this path asks for a tighter one — which still
   * collapses the several quotes one buy makes within a few milliseconds of
   * each other into one request.
   */
  readonly maxAgeMs?: number;
  readonly now?: () => number;
}

/**
 * The reference price, read through a board somebody else owns.
 *
 * `JupiterMarket` can answer this itself, and in the browser it does. In the
 * server it should not: it sits behind `CachedPriceBoard`, and a reference read
 * that goes around the cache pays a fresh request for prices the shelf read a
 * moment ago — which is what every quote used to do.
 */
export class BoardReference implements ReferenceSource {
  private readonly read: ReferenceRead;

  constructor(config: BoardReferenceConfig) {
    this.read = {
      registry: config.registry,
      board: config.board,
      now: config.now ?? Date.now,
      ...(config.maxAgeMs === undefined ? {} : { ask: { maxAgeMs: config.maxAgeMs } }),
    };
  }

  priceFor(ticker: string): Promise<ReferencePrice | null> {
    return referenceFrom(this.read, ticker);
  }
}
