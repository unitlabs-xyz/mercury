import { Decimal, ZERO } from "@mercury/core";

/**
 * What a loan is made of: what was borrowed, and the interest on it.
 *
 * Kamino keeps only the total. Its obligation holds the borrowed amount scaled
 * by an interest index, so what is owed grows every slot and nothing on chain
 * remembers how much of it was ever lent. The ledger does: `loan_event` has a
 * row for every borrow and repay a borrower confirmed, which is enough to say
 * how much of the debt is interest — and to show it, instead of a "Borrowed"
 * figure that is quietly the debt.
 */

/** One `loan_event` row, as far as the principal is concerned. */
export interface LedgerRow {
  readonly kind: string;
  /** Null on a collateral move, and on a repay of everything. */
  readonly usdAmount: Decimal | null;
  /** The debt straight after, as Kamino reported it. */
  readonly debtAfterUsd: Decimal;
}

/**
 * What was borrowed and not yet repaid, from the ledger, oldest row first.
 *
 * A repay comes off the principal rather than the interest. That keeps the
 * interest on screen until the loan is closed, which is when it is actually
 * paid: Kamino settles no interest on its own, it only grows the debt. A repay
 * of everything, or any row after which Kamino said nothing was owed, closes
 * the loan, and a later borrow starts a new one.
 *
 * Null when the ledger records no borrow at all. A debt it cannot account for
 * — a loan taken outside Mercury, or a confirm that never arrived — has no
 * principal to subtract, and calling all of it interest would be a guess.
 */
export const outstandingPrincipal = (rows: readonly LedgerRow[]): Decimal | null => {
  let principal = ZERO;
  let borrowed = false;
  for (const r of rows) {
    if (r.kind === "borrow" && r.usdAmount !== null) {
      principal = principal.add(r.usdAmount);
      borrowed = true;
    } else if (r.kind === "repay") {
      principal = r.usdAmount === null ? ZERO : Decimal.max(ZERO, principal.sub(r.usdAmount));
    }
    if (r.debtAfterUsd.lte(0)) principal = ZERO;
  }
  return borrowed ? principal : null;
};

/**
 * The debt, split. The principal is capped at what is owed, so a repay the
 * ledger missed cannot show more borrowed than the whole debt.
 */
export const loanParts = (
  owed: Decimal,
  principal: Decimal | null,
): { readonly principal: Decimal | null; readonly interest: Decimal | null } => {
  if (principal === null) return { principal: null, interest: null };
  const lent = Decimal.min(principal, owed);
  return { principal: lent, interest: owed.sub(lent) };
};

const HOURS_A_YEAR = 8_760;

/**
 * What a wallet has to hold to repay a loan in full.
 *
 * What is owed, plus an hour of interest at today's rate: the interest that can
 * accrue between reading the debt and the repay landing. Rounded up to the
 * micro-USDC, the smallest amount there is. A repay of everything takes only
 * what is owed, so the headroom never leaves the wallet; it only has to be
 * there. It replaces 0.1% of the debt, which asked a $1,000 borrower to hold
 * $1,001 when a day of interest on it is about $0.21.
 */
export const closeLoanUsdc = (owed: Decimal, borrowApy: Decimal): Decimal =>
  owed.mul(borrowApy.div(HOURS_A_YEAR).add(1)).toDecimalPlaces(6, Decimal.ROUND_UP);

/**
 * Whether a position would be left worth more than nothing but less than
 * Kamino's minimum.
 *
 * Kamino checks this after every borrow, repay, pledge and withdrawal, per
 * asset, at its own oracle prices, and refuses with `NetValueRemainingTooSmall`
 * (6092): a debt or a stock's collateral is either gone, or worth at least the
 * market's `min_net_value_in_obligation`. Read from klend's
 * `lending_operations.rs` on 17 October 2026, and found in practice when a
 * repay of $2.11 against $2.110008 owed was refused.
 */
export const leavesDust = (remainingUsd: Decimal, minUsd: Decimal): boolean =>
  remainingUsd.gt(0) && remainingUsd.lt(minUsd);
