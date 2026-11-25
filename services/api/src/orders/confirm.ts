import { D } from "@mercury/core";
import type { ChainHistory, TokenRegistry } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import type { decisionToWire } from "../serialize.js";
import { planFill, type Fill } from "./fill.js";
import type { FillDeps, SettleResult } from "./settle.js";
import type { StoredOrder } from "./store.js";

/** What it takes to settle an order from the chain. */
export interface ConfirmOrderDeps {
  readonly history: Pick<ChainHistory, "transaction">;
  readonly registry: Pick<TokenRegistry, "byMint">;
  readonly multipliers: Pick<MultiplierSource, "multiplierFor">;
  readonly prices: Pick<PriceBoard, "pricesFor">;
  readonly fills: FillDeps;
  /** The relayer, when there is one: what is paid to it is Mercury's fee, not money the swap spent. */
  readonly relayer?: string | undefined;
}

/** An order's transaction as it was built: what the server needs to settle it but the signature. */
export interface TrackedOrder {
  readonly userId: string;
  readonly walletId: string;
  readonly address: string;
  readonly orderId: string;
}

export interface ConfirmOrderInput {
  readonly userId: string;
  readonly walletId: string;
  readonly address: string;
  readonly signature: string;
}

export type ConfirmedOrder =
  | { readonly kind: "settled"; readonly settled: SettleResult; readonly fill: Fill }
  /** The node has not returned the transaction yet. Worth asking again. */
  | { readonly kind: "pending" }
  /** Asking again changes nothing. `code` is the API's, `status` the HTTP answer. */
  | {
      readonly kind: "refused";
      readonly status: 404 | 409 | 422;
      readonly code: "not_found" | "instrument_not_tradable" | "validation_failed";
      readonly message: string;
    };

/** A millionth of a dollar: USDC's own precision, below which a shortfall is only rounding. */
const FEE_TOLERANCE = D("0.000001");

/**
 * Settle an order from the transaction that filled it, read off the chain.
 *
 * Shared by the app's confirm and by the server's own tracking of every
 * transaction it sent (`orders/sends.ts`), so an order is settled whether or
 * not the page that placed it is still open. Safe to run twice: the order row
 * is claimed with a conditional update in `settleOrder`.
 *
 * Mercury's fee is checked here, against what the transaction really paid.
 * The server built the transaction with the charge in it, but the wallet that
 * signs it is the fee payer and nothing stops its owner editing the message
 * before signing. A fill that did not pay the fee agreed when it was built is
 * not settled as an order of ours.
 */
export async function confirmOrder(
  deps: ConfirmOrderDeps,
  order: StoredOrder,
  input: ConfirmOrderInput,
): Promise<ConfirmedOrder> {
  const decision = order.decision as ReturnType<typeof decisionToWire>;
  if (decision.kind === "refuse") {
    return { kind: "refused", status: 409, code: "instrument_not_tradable", message: decision.detail };
  }

  const mint = decision.best.mint;
  const [ref, token, multiplier, board] = await Promise.all([
    deps.fills.tokenRef(mint),
    deps.registry.byMint(mint),
    deps.multipliers.multiplierFor(mint),
    // The underlying quote, to record on the lot beside the price paid. Read
    // now rather than taken from the order's own `referencePrice`, which is
    // from the quote the user was shown and can be a minute older than the fill.
    deps.prices.pricesFor([mint]),
  ]);
  if (ref === null || token === null) {
    return { kind: "refused", status: 404, code: "not_found", message: "Unknown token." };
  }

  /*
   * Not yet on chain is a different answer from never: a caller can ask before
   * the node it asks has caught up, and that is worth retrying.
   */
  const tx = await deps.history.transaction(input.signature);
  if (tx === null) return { kind: "pending" };

  const fill = planFill(tx, {
    wallet: input.address,
    side: decision.side,
    mint,
    decimals: token.decimals,
    multiplier: multiplier ?? D(1),
    // Without this the charge for sponsoring is indistinguishable from money
    // the swap spent, and it lands in the share price.
    ...(deps.relayer === undefined ? {} : { relayer: deps.relayer }),
    now: new Date(),
  });
  if (fill.kind === "not_a_fill") {
    return { kind: "refused", status: 422, code: "validation_failed", message: fill.detail };
  }

  if (deps.relayer !== undefined && order.mercuryFeeUsd !== null) {
    const agreed = D(order.mercuryFeeUsd);
    if (agreed.gt(0) && fill.feeUsd.add(FEE_TOLERANCE).lt(agreed)) {
      return {
        kind: "refused",
        status: 422,
        code: "validation_failed",
        message: "This transaction did not pay Mercury's fee, so it is not recorded as an order.",
      };
    }
  }

  const settled = await deps.fills.settle({
    userId: input.userId,
    walletId: input.walletId,
    orderId: order.id,
    signature: input.signature,
    side: decision.side,
    ticker: decision.ticker,
    mint,
    tokenId: ref.tokenId,
    instrumentId: ref.instrumentId,
    fill,
    referencePricePerShare: board.get(mint)?.pricePerShare ?? null,
  });
  return { kind: "settled", settled, fill };
}
