import { and, eq, gte, inArray } from "drizzle-orm";
import { applySell, D, ZERO, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, disposals, instruments, lots, orders, positions, tokens } from "../db/schema.js";
import type { Fill } from "./fill.js";
import { logger } from "../log/index.js";

const log = logger("orders");

export interface SettleInput {
  readonly userId: string;
  readonly orderId: string;
  readonly signature: string;
  readonly side: "buy" | "sell";
  readonly ticker: string;
  readonly mint: string;
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly fill: Fill;
  /**
   * What one real share was quoted at around the fill, from the price board.
   *
   * Recorded on the lot so a return can be split into what the stock did and
   * what it cost to get in. Null when nothing could price the mint, and then
   * the execution price stands in for it downstream.
   */
  readonly referencePricePerShare: Decimal | null;
}

/** The rows a fill is written against, resolved from the mint the order chose. */
export interface TokenRef {
  readonly tokenId: string;
  readonly instrumentId: string;
}

export interface FillDeps {
  tokenRef(mint: string): Promise<TokenRef | null>;
  settle(input: SettleInput): Promise<SettleResult>;
}

export type SettleResult =
  | { readonly kind: "settled"; readonly realisedPnlUsd: Decimal | null }
  | { readonly kind: "already_settled" };

const fixed = (v: Decimal): string => v.toFixed(18);

/** Trailing zeros, but only after a decimal point: "100" must not become "1". */
const trim = (v: Decimal, dp: number): string => {
  const s = v.toDecimalPlaces(dp).toFixed();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

const money = (v: Decimal): string => `$${v.toDecimalPlaces(2).toFixed(2)}`;

/**
 * What a sell made, when we can prove it. Gross of the sell's own fee, which
 * is recorded beside it on the same order row and so counted exactly once.
 *
 * Average cost, against the shares we hold a lot for. When the user is selling
 * more shares than we have a basis for — some arrived by a path we did not
 * witness — there is no honest figure to print, so this returns null and the
 * feed says nothing rather than something wrong. That is the same rule
 * `sharesWithBasis` exists to enforce on the portfolio screen.
 */
const realisedOn = (
  sharesSold: Decimal,
  proceedsUsd: Decimal,
  row: { sharesWithBasis: string; costBasisUsd: string } | undefined,
): Decimal | null => {
  if (row === undefined) return null;
  const held = D(row.sharesWithBasis);
  if (held.lte(ZERO) || sharesSold.gt(held)) return null;
  return applySell({ shares: held, costBasisUsd: D(row.costBasisUsd) }, sharesSold, proceedsUsd)
    .realisedPnlUsd;
};

/**
 * Write a filled order into the books: the order row, the lot, the feed entry.
 *
 * One database transaction, so a half-settled order cannot exist — a lot
 * without its order, or an order marked filled with no cost recorded, would
 * both put a wrong number on the portfolio screen until someone noticed.
 *
 * Settling twice is not an error and does not double anything. The order row is
 * claimed with a conditional update, which is atomic: two confirms of the same
 * signature race, one wins, the loser is told it was already settled and writes
 * nothing. That is what makes this safe to retry from a flaky client, and it is
 * why the signature is recorded on the same statement that flips the status.
 *
 * A sell writes no lot, on purpose: lots record what was acquired, and selling
 * acquires nothing. It writes a disposal instead, the tokens that left, and
 * the position follows from `planReconciliation`, which replays lots and
 * disposals in the order they were recorded at average cost. The cost per
 * share of what remains is exactly what it was, and the cost of what was sold
 * goes with it rather than staying to be mixed into the next purchase.
 */
export async function settleOrder(db: Db, input: SettleInput): Promise<SettleResult> {
  const { fill } = input;

  return await db.transaction(async (tx) => {
    // The claim. Only an order that has not reached an end can be settled, and
    // only one caller can win this update.
    const claimed = await tx
      .update(orders)
      .set({
        status: "filled",
        txSignature: input.signature,
        filledAt: fill.occurredAt,
        feeUsd: fixed(fill.feeUsd),
      })
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.userId, input.userId),
          inArray(orders.status, ["pending", "executing"]),
        ),
      )
      .returning({ id: orders.id, createdAt: orders.createdAt });

    if (claimed.length === 0) {
      /*
       * Two callers raced for one order and this one lost, which is the
       * guarantee the claim exists for rather than a fault — a client that
       * submits twice, or the webhook arriving beside the poller. Debug
       * because it is expected and common; it earns a line only when
       * somebody is working out why a fill was recorded once.
       */
      log.debug({ userId: input.userId, orderId: input.orderId }, "order was already settled");
      return { kind: "already_settled" };
    }

    if (input.side === "buy") {
      await tx.insert(lots).values({
        userId: input.userId,
        tokenId: input.tokenId,
        instrumentId: input.instrumentId,
        tokenQty: fill.tokensRaw,
        shares: fixed(fill.shares),
        // The price actually paid, per real share. Not the quote.
        unitCostUsd: fixed(fill.pricePerShare),
        feeUsd: fixed(fill.feeUsd),
        ...(input.referencePricePerShare === null
          ? {}
          : { referencePriceUsd: fixed(input.referencePricePerShare) }),
        acquiredAt: fill.occurredAt,
        source: "buy",
        // We watched this one land and read the amounts off the chain.
        isEstimated: false,
        orderId: input.orderId,
      });
    }

    if (input.side === "sell") {
      /*
       * A transfer out position-sync recorded since this order began is this
       * sell, seen on the chain before the client came back to confirm it. It
       * is taken back, so the shares leave once. If any of that drop really
       * was a transfer, the next pass finds the gap again.
       *
       * The sell takes the place of the earliest it took back, in the order
       * rows were recorded. The replay is by that order, and a sell dated now
       * would jump any lot recorded between the two, costing it as if it had
       * been bought before the shares left.
       */
      const takenBack = await tx
        .delete(disposals)
        .where(
          and(
            eq(disposals.userId, input.userId),
            eq(disposals.tokenId, input.tokenId),
            eq(disposals.kind, "transfer_out"),
            gte(disposals.recordedAt, claimed[0]!.createdAt),
          ),
        )
        .returning({ recordedAt: disposals.recordedAt });
      const sat = takenBack.reduce<Date | undefined>(
        (earliest, t) => (earliest === undefined || t.recordedAt < earliest ? t.recordedAt : earliest),
        undefined,
      );
      await tx
        .insert(disposals)
        .values({
          userId: input.userId,
          tokenId: input.tokenId,
          instrumentId: input.instrumentId,
          tokenQty: fill.tokensRaw,
          shares: fixed(fill.shares),
          kind: "sell",
          orderId: input.orderId,
          occurredAt: fill.occurredAt,
          ...(sat === undefined ? {} : { recordedAt: sat }),
        })
        // The claim already refuses a second settle; the unique order id
        // refuses a second disposal whatever reaches this line.
        .onConflictDoNothing();
    }

    const [position] =
      input.side === "sell"
        ? await tx
            .select({ sharesWithBasis: positions.sharesWithBasis, costBasisUsd: positions.costBasisUsd })
            .from(positions)
            .where(and(eq(positions.userId, input.userId), eq(positions.instrumentId, input.instrumentId)))
            .limit(1)
        : [];

    const realisedPnlUsd = input.side === "sell" ? realisedOn(fill.shares, fill.usd, position) : null;

    // Stored on the order, which is the only place it lives: the feed's line no
    // longer prints it, and the receipt reads it from here.
    if (realisedPnlUsd !== null) {
      await tx
        .update(orders)
        .set({ realisedPnlUsd: fixed(realisedPnlUsd) })
        .where(eq(orders.id, input.orderId));
    }

    await tx
      .insert(activities)
      .values({
        userId: input.userId,
        kind: input.side,
        occurredAt: fill.occurredAt,
        title: `${input.side === "buy" ? "Bought" : "Sold"} ${input.ticker}`,
        // The trade, and nothing else. The gain and the fee are on the order and
        // the lot, and the receipt shows each on its own line; folded in here they
        // made a line nobody could read at a glance.
        subtitle: `${trim(fill.shares, 6)} shares at ${money(fill.pricePerShare)}`,
        // What crossed the wallet's edge, which is the swap plus the charge on
        // a buy and the swap less the charge on a sell. The feed is about cash
        // moving; the price the shares went at is in the subtitle.
        amountUsd: fixed(input.side === "buy" ? fill.usd.add(fill.feeUsd) : fill.usd.sub(fill.feeUsd)),
        refTable: "order",
        refId: input.orderId,
        txSignature: input.signature,
        mint: input.mint,
      })
      // The wallet-events job walks the same signature from the wallet's side.
      // Whichever arrives second writes nothing. See activity_signature_mint_idx.
      .onConflictDoNothing();

    /* The money line: a fill that happened, with what it cost. `side` and

       `orderId` are fields so the shape of a day's trading is a query.

       Figures that belong to the user — the shares, the basis — are

       redacted; the fee is ours and is what the relayer charged us. */

    log.info(
      { userId: input.userId, orderId: input.orderId, side: input.side, feeUsd: String(fill.feeUsd) },

      "order settled",
    );

    return { kind: "settled", realisedPnlUsd };
  });
}

/** The token and instrument ids behind a mint. */
export async function tokenRefFor(db: Db, mint: string): Promise<TokenRef | null> {
  const [row] = await db
    .select({ tokenId: tokens.id, instrumentId: instruments.id })
    .from(tokens)
    .innerJoin(instruments, eq(instruments.id, tokens.instrumentId))
    .where(eq(tokens.mint, mint))
    .limit(1);
  return row ?? null;
}
