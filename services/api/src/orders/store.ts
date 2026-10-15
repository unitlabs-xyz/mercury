import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { instruments, orders, tokens } from "../db/schema.js";
import { logger } from "../log/index.js";

/*
 * `partially_filled` and `expired` were here with nothing able to write them.
 * A swap is one atomic transaction — it lands or it does not — and expiry
 * belonged to trigger orders, which are not built. See @mercury/types.
 */
const log = logger("orders");

export type OrderStatus = "pending" | "executing" | "filled" | "queued" | "cancelled" | "refused";

export interface NewOrder {
  readonly userId: string;
  readonly ticker: string;
  readonly side: "buy" | "sell";
  readonly usdAmount: string;
  /** Sell the whole position, in tokens. See `orders.max`. */
  readonly max?: boolean;
  /** The Decision from `@mercury/core`, already serialised. Kept verbatim. */
  readonly decision: unknown;
  readonly chosenMint: string | null;
  readonly referencePrice: string | null;
  readonly premiumPct: string | null;
  readonly status: OrderStatus;
}

/** The fields a re-decision replaces. The winner can change, so the token can too. */
export interface Repricing {
  readonly decision: unknown;
  readonly chosenMint: string | null;
  readonly referencePrice: string | null;
  readonly premiumPct: string | null;
  readonly status: OrderStatus;
  /**
   * Mercury's fee in the transaction this pass built. Absent when it built
   * none — a refusal, or a price that moved — and stored as null then, so the
   * row never keeps the fee of a build that its decision no longer describes.
   */
  readonly mercuryFeeUsd?: string | null;
}

export interface StoredOrder {
  readonly id: string;
  readonly decision: unknown;
  readonly status: OrderStatus;
  /**
   * What was asked for, in dollars, on both sides.
   *
   * Needed because a stored sell decision's `amount` is in shares — that is
   * what `decide` reports — and re-pricing wants the dollars the user actually
   * typed. Reading the shares as dollars would re-quote a $500 sell as five.
   */
  readonly usdAmount: string;
  readonly max: boolean;
  /** Mercury's fee in the last transaction built for it. Null until one is. */
  readonly mercuryFeeUsd: string | null;
  readonly createdAt: string;
}

export interface OrderStore {
  create(order: NewOrder): Promise<StoredOrder>;
  byId(userId: string, id: string): Promise<StoredOrder | null>;
  setStatus(userId: string, id: string, status: OrderStatus): Promise<void>;
  /**
   * Replace the decision on an order that is about to be built, or that we are
   * refusing to build. Execution re-prices before it signs, and the row has to
   * end up holding the decision that was actually acted on rather than the one
   * the user first saw — otherwise the audit trail records a price nobody filled.
   */
  reprice(userId: string, id: string, next: Repricing): Promise<void>;
}

/**
 * The `order` table behind the interface the in-memory Map had.
 *
 * `decision` is stored verbatim as jsonb. When a user asks why they were sold
 * one wrapper and not the other, the answer is a row — that is the whole reason
 * docs/05 keeps the blob rather than the fields it contains.
 */
const tokenIdFor = async (db: Db, mint: string | null): Promise<string | null> =>
  mint === null
    ? null
    : ((await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.mint, mint)).limit(1))[0]?.id ??
      null);

export const pgOrderStore = (db: Db): OrderStore => ({
  async create(order) {
    const [instrument] = await db
      .select({ id: instruments.id })
      .from(instruments)
      .where(eq(instruments.ticker, order.ticker))
      .limit(1);
    if (instrument === undefined) {
      /* A ticker the API offered and the database does not have, which means
         the stocks job and the shelf disagree. */
      log.error({ ticker: order.ticker }, "no instrument row for a ticker that was quoted");
      throw new Error(`no instrument row for ${order.ticker}`);
    }

    const chosenTokenId = await tokenIdFor(db, order.chosenMint);

    const [saved] = await db
      .insert(orders)
      .values({
        userId: order.userId,
        instrumentId: instrument.id,
        side: order.side,
        usdAmount: order.usdAmount,
        max: order.max ?? false,
        decision: order.decision,
        chosenTokenId,
        referencePrice: order.referencePrice,
        premiumPct: order.premiumPct,
        status: order.status,
      })
      .returning({
        id: orders.id,
        decision: orders.decision,
        status: orders.status,
        usdAmount: orders.usdAmount,
        max: orders.max,
        mercuryFeeUsd: orders.mercuryFeeUsd,
        createdAt: orders.createdAt,
      });
    if (saved === undefined) throw new Error("order insert returned nothing");

    /*
     * The other half of the money story: an order that was asked for. With
     * "order settled" and "order refused at execution" this makes the whole
     * path countable — asked, refused, filled — which is what a conversion
     * rate is, and none of it was recorded before.
     *
     * `usdAmount` is what the user typed rather than what they hold, so it is
     * not a balance; `max` says whether they asked to sell the lot.
     */
    log.info(
      {
        userId: order.userId,
        orderId: saved.id,
        side: order.side,
        ticker: order.ticker,
        usdAmount: order.usdAmount,
        max: order.max ?? false,
        status: order.status,
      },
      "order created",
    );

    return {
      id: saved.id,
      decision: saved.decision,
      status: saved.status,
      usdAmount: saved.usdAmount,
      max: saved.max,
      mercuryFeeUsd: saved.mercuryFeeUsd,
      createdAt: saved.createdAt.toISOString(),
    };
  },

  async byId(userId, id) {
    const [row] = await db
      .select({
        id: orders.id,
        decision: orders.decision,
        status: orders.status,
        usdAmount: orders.usdAmount,
        max: orders.max,
        mercuryFeeUsd: orders.mercuryFeeUsd,
        createdAt: orders.createdAt,
      })
      .from(orders)
      // Scoped to the caller. An order id is a uuid, but a route that trusts one
      // without an owner check is a route that will one day be handed someone
      // else's.
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1);
    return row === undefined
      ? null
      : {
          id: row.id,
          decision: row.decision,
          status: row.status,
          usdAmount: row.usdAmount,
          max: row.max,
          mercuryFeeUsd: row.mercuryFeeUsd,
          createdAt: row.createdAt.toISOString(),
        };
  },

  async setStatus(userId, id, status) {
    await db
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
  },

  async reprice(userId, id, next) {
    await db
      .update(orders)
      .set({
        decision: next.decision,
        chosenTokenId: await tokenIdFor(db, next.chosenMint),
        referencePrice: next.referencePrice,
        premiumPct: next.premiumPct,
        status: next.status,
        mercuryFeeUsd: next.mercuryFeeUsd ?? null,
      })
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
  },
});
