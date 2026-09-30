import { D, type Decimal } from "@mercury/core";
import type { TokenBalance } from "@mercury/chain";

/**
 * How many tokens of each wrapper a sell can actually consume.
 *
 * A sell is asked for in shares, and a share is not a token: every wrapper
 * carries its own multiplier, so the same two shares are a different number of
 * tokens in each. And no wrapper can sell more than the wallet holds of it.
 *
 * Pledged stock never appears here, and that is not an oversight. `deps.chain`
 * is the raw reader — only the reconciler wraps it with `withPledged` — so what
 * Kamino holds as collateral is simply not in these balances. The books count
 * it as owned; the wallet cannot spend it.
 *
 * Pure. No chain, no clock.
 */

export interface SellableWrapper {
  readonly mint: string;
  readonly decimals: number;
  /** Shares of the underlying that one token represents. Always >= 1. */
  readonly multiplier: Decimal;
}

export interface SellableAmount {
  readonly mint: string;
  /** Whole tokens to sell. Never more than the wallet holds. */
  readonly tokens: Decimal;
  /** True when the balance, not the request, decided the amount. */
  readonly capped: boolean;
}

/** decimal.js's ROUND_DOWN. The same literal `jupiter/lite.ts` uses. */
const ROUND_DOWN = 1;

/** `shares` of null means everything: what "Sell all" asks for. */
export const sellableAmounts = (
  wrappers: readonly SellableWrapper[],
  balances: readonly TokenBalance[],
  shares: Decimal | null,
): readonly SellableAmount[] => {
  const byMint = new Map(balances.map((b) => [b.mint, b]));

  return wrappers.flatMap((w) => {
    const balance = byMint.get(w.mint);
    if (balance === undefined || balance.rawAmount <= 0n) return [];
    const held = D(balance.rawAmount.toString()).div(D(10).pow(balance.decimals));

    if (shares === null) return [{ mint: w.mint, tokens: held, capped: false }];

    /*
     * Down, always. Rounding a share count up asks the swap for tokens the
     * wallet does not have, and the transaction then fails on chain after the
     * user has already signed it.
     */
    const wanted = shares.div(w.multiplier).toDecimalPlaces(w.decimals, ROUND_DOWN);
    const capped = wanted.gt(held);
    return [{ mint: w.mint, tokens: capped ? held : wanted, capped }];
  });
};
