import { D, ZERO, type Decimal } from "@mercury/core";
import { USDC_DECIMALS, USDC_MINT, type TransactionDetail } from "@mercury/chain";

/**
 * Putting a historical trade's fee where it belongs.
 *
 * Every order settled before the fee was separated recorded the wallet's whole
 * USDC delta as the trade, so the charge for sponsoring is inside the price per
 * share the lot holds. The charge is still readable: it is on the chain, in the
 * relayer's own leg of the same transaction that filled the order.
 *
 * Pure. The runner fetches rows and transactions and writes what this decides,
 * which is what makes a backfill over real money something a test can pin.
 */

/** One order as the backfill needs it. */
export interface BackfillOrder {
  readonly id: string;
  readonly side: "buy" | "sell";
  readonly txSignature: string;
  /** The fair price per share from the quote the user was shown, if we kept it. */
  readonly referencePrice: Decimal | null;
  /** The buy's lot. Absent on a sell, which writes none. */
  readonly lot: { readonly id: string; readonly shares: Decimal; readonly unitCostUsd: Decimal } | null;
}

export interface OrderCorrection {
  readonly orderId: string;
  readonly feeUsd: Decimal;
  /**
   * The lot's corrected figures. Absent when there is no lot to correct, or
   * when correcting it would not change it.
   */
  readonly lot?: {
    readonly id: string;
    readonly unitCostUsd: Decimal;
    readonly feeUsd: Decimal;
    /** From the order's quote, which is the closest record of the fill there is. */
    readonly referencePriceUsd: Decimal | null;
  };
}

export type Skipped = { readonly orderId: string; readonly reason: string };

export interface BackfillPlan {
  readonly corrections: readonly OrderCorrection[];
  readonly skipped: readonly Skipped[];
}

const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

const sumOwned = (
  entries: readonly { owner: string | null; mint: string; rawAmount: bigint }[],
  owner: string,
) =>
  entries.reduce((total, e) => (e.owner === owner && e.mint === USDC_MINT ? total + e.rawAmount : total), 0n);

/** What the relayer took out of this transaction. Only a gain counts; see `planFill`. */
const chargeIn = (tx: TransactionDetail, relayer: string): Decimal => {
  const delta = sumOwned(tx.postTokens, relayer) - sumOwned(tx.preTokens, relayer);
  return delta > 0n ? scaled(delta, USDC_DECIMALS) : ZERO;
};

/**
 * What to write for each order whose fee was never recorded.
 *
 * A buy's lot is corrected as well as the order: the fee comes back out of the
 * price per share, which is the whole point — leaving it there would keep every
 * position that predates this opening at a loss of exactly the fee.
 *
 * A sell's realised figure is not reconstructed. It was computed against the
 * position as it stood at the moment of settlement, and that state is gone; a
 * figure recomputed against today's position would be a plausible number with
 * nothing behind it, which is worse than the null that is there now.
 *
 * Idempotent: the runner only passes orders with no fee recorded, and the
 * correction for one is the same whenever it is computed.
 */
export function planFeeBackfill(
  orders: readonly BackfillOrder[],
  transactions: ReadonlyMap<string, TransactionDetail>,
  relayer: string,
): BackfillPlan {
  const corrections: OrderCorrection[] = [];
  const skipped: Skipped[] = [];

  for (const order of orders) {
    const tx = transactions.get(order.txSignature);
    if (tx === undefined) {
      skipped.push({ orderId: order.id, reason: "transaction not found on chain" });
      continue;
    }
    if (!tx.succeeded) {
      skipped.push({ orderId: order.id, reason: "transaction did not succeed" });
      continue;
    }

    const feeUsd = chargeIn(tx, relayer);
    if (order.lot === null) {
      corrections.push({ orderId: order.id, feeUsd });
      continue;
    }

    const { id, shares, unitCostUsd } = order.lot;
    if (shares.lte(ZERO)) {
      skipped.push({ orderId: order.id, reason: "lot records no shares" });
      continue;
    }

    const corrected = unitCostUsd.sub(feeUsd.div(shares));
    // A fee at or above the whole cost of the lot cannot be right, and writing
    // a zero or negative price per share would report the position's entire
    // value as profit. Left alone and reported, rather than guessed at.
    if (corrected.lte(ZERO)) {
      skipped.push({ orderId: order.id, reason: "fee is the whole of the recorded cost" });
      continue;
    }

    corrections.push({
      orderId: order.id,
      feeUsd,
      lot: {
        id,
        unitCostUsd: corrected,
        feeUsd,
        referencePriceUsd: order.referencePrice,
      },
    });
  }

  return { corrections, skipped };
}
