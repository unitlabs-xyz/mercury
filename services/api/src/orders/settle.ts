import { and, eq, inArray } from "drizzle-orm";
import { applySell, D, ZERO, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, instruments, lots, orders, positions, tokens } from "../db/schema.js";
import type { Fill } from "./fill.js";

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
 * What a sell made, when we can prove it.
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
 * A sell writes no lot, on purpose. Lots record what was acquired and what it
 * cost; selling acquires nothing. The position follows from
 * `planReconciliation`, which caps the basis at what the chain says is held and
 * scales the recorded cost by the same ratio — which leaves the average unit
 * cost of what remains exactly as it was. That is average-cost accounting, and
 * it is already how a sell is absorbed today.
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
      })
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.userId, input.userId),
          inArray(orders.status, ["pending", "executing"]),
        ),
      )
      .returning({ id: orders.id });

    if (claimed.length === 0) return { kind: "already_settled" };

    if (input.side === "buy") {
      await tx.insert(lots).values({
        userId: input.userId,
        tokenId: input.tokenId,
        instrumentId: input.instrumentId,
        tokenQty: fill.tokensRaw,
        shares: fixed(fill.shares),
        // The price actually paid, per real share. Not the quote.
        unitCostUsd: fixed(fill.pricePerShare),
        acquiredAt: fill.occurredAt,
        source: "buy",
        // We watched this one land and read the amounts off the chain.
        isEstimated: false,
        orderId: input.orderId,
      });
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

    const gain =
      realisedPnlUsd === null
        ? ""
        : ` · ${realisedPnlUsd.gte(ZERO) ? "+" : "−"}${money(realisedPnlUsd.abs())}`;

    await tx
      .insert(activities)
      .values({
        userId: input.userId,
        kind: input.side,
        occurredAt: fill.occurredAt,
        title: `${input.side === "buy" ? "Bought" : "Sold"} ${input.ticker}`,
        subtitle: `${trim(fill.shares, 6)} shares at ${money(fill.pricePerShare)}${gain}`,
        amountUsd: fixed(fill.usd),
        refTable: "order",
        refId: input.orderId,
        txSignature: input.signature,
        mint: input.mint,
      })
      // The wallet-events job walks the same signature from the wallet's side.
      // Whichever arrives second writes nothing. See activity_signature_mint_idx.
      .onConflictDoNothing();

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
