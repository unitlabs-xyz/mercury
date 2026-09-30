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
  /** The trader's wallet. */
  readonly owner: string;
  /**
   * The mint whose account may have to be opened: the one the trade delivers
   * into. The stock on a buy, USDC on a sell.
   *
   * This was `mint` and meant "the stock", which is right exactly half the
   * time. A seller always holds the stock account already — it is the dollars
   * that might have nowhere to land.
   */
  readonly receivingMint: string;
}

/** Nothing is owed. Sponsorship is off, so the buyer pays their own way. */
export const NO_FEE: Fee = { usdc: D(0), lamports: 0 };

/**
 * What this particular trade will cost the relayer, for this particular trader.
 *
 * Two facts decide it, and both are about them rather than about the order:
 * whether they already hold the account the trade delivers into — a second buy
 * of the same stock opens no account and so owes no rent, and neither does a
 * sell into a USDC account that is already there — and what SOL costs now.
 *
 * Read together, because they are two round trips and someone is waiting on
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
   * the relayer to pay an unknown amount, and the trade itself is fine either
   * way — it is only the repayment that cannot be priced.
   */
  if (sol === undefined || sol.lte(0)) return NO_FEE;

  /*
   * Holding any amount of the token means the account exists, and an account
   * that exists is already rent-exempt. A zero balance still counts: the
   * account is what rent pays for, not the tokens in it.
   */
  const holds = balances.some((b) => b.mint === input.receivingMint);
  return networkFee({ needsTokenAccount: !holds, solPriceUsd: sol });
};
