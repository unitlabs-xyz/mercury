import { D } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import { networkFee, type Fee } from "./fee.js";

/** Native SOL trades under the wrapped-SOL mint, which is how it is priced. */
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface FeeQuoteDeps {
  readonly chain: ChainReader;
  readonly prices: PriceBoard;
}

export interface FeeQuoteInput {
  /** The buyer's wallet. */
  readonly owner: string;
  /** The token the shares will arrive as. */
  readonly mint: string;
}

/** Nothing is owed. Sponsorship is off, so the buyer pays their own way. */
export const NO_FEE: Fee = { usdc: D(0), lamports: 0 };

/**
 * What this particular buy will cost the relayer, for this particular buyer.
 *
 * Two facts decide it, and both are about them rather than about the order:
 * whether they already hold the token — a second buy of the same stock opens
 * no account and so owes no rent — and what SOL costs right now.
 *
 * Read together, because they are two round trips and a buyer is waiting on
 * both.
 */
export const quoteFee = async (deps: FeeQuoteDeps, input: FeeQuoteInput): Promise<Fee> => {
  const [balances, prices] = await Promise.all([
    deps.chain.tokenBalances(input.owner),
    deps.prices.pricesFor([SOL_MINT]),
  ]);

  const sol = prices.get(SOL_MINT)?.usdPricePerToken;
  /*
   * No price, no charge. Guessing would mean either overcharging or asking
   * the relayer to pay an unknown amount, and the buy itself is fine either
   * way — it is only the repayment that cannot be priced.
   */
  if (sol === undefined || sol.lte(0)) return NO_FEE;

  /*
   * Holding any amount of the token means the account exists, and an account
   * that exists is already rent-exempt. A zero balance still counts: the
   * account is what rent pays for, not the tokens in it.
   */
  const holds = balances.some((b) => b.mint === input.mint);
  return networkFee({ needsTokenAccount: !holds, solPriceUsd: sol });
};
