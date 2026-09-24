import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { instruments, orders, tokens } from "../db/schema.js";

export type OrderStatus =
  "pending" | "executing" | "filled" | "queued" | "partially_filled" | "expired" | "cancelled" | "refused";

export interface NewOrder {
  readonly userId: string;
  readonly ticker: string;
  readonly side: "buy" | "sell";
  readonly usdAmount: string;
  /** The Decision from `@mercury/core`, already serialised. Kept verbatim. */
  readonly decision: unknown;
  readonly chosenMint: string | null;
  readonly referencePrice: string | null;
  readonly premiumPct: string | null;
  readonly status: OrderStatus;
}

export interface StoredOrder {
  readonly id: string;
  readonly decision: unknown;
  readonly status: OrderStatus;
  readonly createdAt: string;
}

export interface OrderStore {
  create(order: NewOrder): Promise<StoredOrder>;
  byId(userId: string, id: string): Promise<StoredOrder | null>;
  setStatus(userId: string, id: string, status: OrderStatus): Promise<void>;
}

/**
 * The `order` table behind the interface the in-memory Map had.
 *
 * `decision` is stored verbatim as jsonb. When a user asks why they were sold
 * one wrapper and not the other, the answer is a row — that is the whole reason
 * docs/05 keeps the blob rather than the fields it contains.
 */
export const pgOrderStore = (db: Db): OrderStore => ({
  async create(order) {
    const [instrument] = await db
      .select({ id: instruments.id })
      .from(instruments)
      .where(eq(instruments.ticker, order.ticker))
      .limit(1);
    if (instrument === undefined) throw new Error(`no instrument row for ${order.ticker}`);

    const chosenTokenId =
      order.chosenMint === null
        ? null
        : ((
            await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.mint, order.chosenMint)).limit(1)
          )[0]?.id ?? null);

    const [saved] = await db
      .insert(orders)
      .values({
        userId: order.userId,
        instrumentId: instrument.id,
        side: order.side,
        usdAmount: order.usdAmount,
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
        createdAt: orders.createdAt,
      });
    if (saved === undefined) throw new Error("order insert returned nothing");

    return {
      id: saved.id,
      decision: saved.decision,
      status: saved.status,
      createdAt: saved.createdAt.toISOString(),
    };
  },

  async byId(userId, id) {
    const [row] = await db
      .select({
        id: orders.id,
        decision: orders.decision,
        status: orders.status,
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
      : { id: row.id, decision: row.decision, status: row.status, createdAt: row.createdAt.toISOString() };
  },

  async setStatus(userId, id, status) {
    await db
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
  },
});
