import { D, type Decimal, type Decision } from "@mercury/core";

/**
 * What to do with an order that has been re-priced at execution time.
 *
 * `build` means the fresh decision passed every guard and did not move far
 * enough from what the user agreed to that they should be asked again.
 */
export type Gate =
  | { readonly kind: "build" }
  | { readonly kind: "refuse"; readonly detail: string }
  | { readonly kind: "moved"; readonly detail: string; readonly adverseBps: Decimal | null };

export interface GateInput {
  /** The price per share the user confirmed against, from the stored decision. */
  readonly shownPricePerShare: string | null;
  /** The decision just made, on a quote fetched in this request. */
  readonly fresh: Decision;
  readonly maxQuoteDriftBps: number;
}

/**
 * The rule that keeps the quote a user agreed to and the quote they fill at the
 * same quote.
 *
 * An order is priced when it is created and built when the user is ready to
 * sign, and those are two different moments — long enough apart that the
 * reference price alone may be five minutes old by the second one. Building
 * from the first quote would fill at a price nothing had checked; re-pricing
 * and building silently would fill at a price nobody had agreed to. So the
 * fresh decision carries every guard, and this compares it against what was
 * shown: close enough, and it fills; not close enough, and the user is asked
 * again with the new number in front of them.
 *
 * Drift is signed so that positive is always worse for the user. A buy that
 * got cheaper and a sell that got dearer both pass without comment — there is
 * nothing to warn someone about when the market moved in their favour.
 */
export const gateExecution = ({ shownPricePerShare, fresh, maxQuoteDriftBps }: GateInput): Gate => {
  if (fresh.kind === "refuse") return { kind: "refuse", detail: fresh.detail };

  // Shut, and outside tolerance: `decide` declines to fill this on its own and
  // offers to wait. Waiting is a trigger order, which is not built yet, so the
  // honest answer is the price moved rather than a queue we cannot join.
  if (fresh.kind === "offer_queue") {
    return {
      kind: "moved",
      detail: "The price moved out of range while the market is closed.",
      adverseBps: null,
    };
  }

  const now = fresh.best.pricePerShare;
  // Nothing to compare against — a decision that reached `execute` without a
  // price is not a case `decide` can produce, and a missing stored price means
  // an older row. Neither is a reason to block a quote that just passed.
  if (shownPricePerShare === null || now === null) return { kind: "build" };

  const was = D(shownPricePerShare);
  if (was.lte(0)) return { kind: "build" };

  const move = now.div(was).sub(1);
  const adverseBps = (fresh.side === "buy" ? move : move.neg()).mul(10_000);

  return adverseBps.gt(maxQuoteDriftBps)
    ? { kind: "moved", detail: "The price moved while you were confirming.", adverseBps }
    : { kind: "build" };
};
