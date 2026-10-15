import { D } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import { USDC_MINT } from "@mercury/chain";
import { networkFee, transferFee, type Fee } from "./fee.js";
import { STOCK_ACCOUNT_BYTES, TOKEN_ACCOUNT_BYTES, rentFor } from "../rent.js";

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
 * The rent itself is the node's figure for that account's size.
 *
 * Read together, because someone is waiting on all three. The rent is asked
 * even when it turns out not to be owed: the reader keeps it for an hour, so
 * asking costs nothing, and waiting to know would cost a round trip.
 */
export const quoteFee = async (deps: FeeQuoteDeps, input: FeeQuoteInput): Promise<Fee> => {
  const [balances, prices, rent] = await Promise.all([
    deps.chain.tokenBalances(input.owner),
    deps.prices.pricesFor([SOL_MINT]),
    rentFor(deps.chain, input.receivingMint === USDC_MINT ? TOKEN_ACCOUNT_BYTES : STOCK_ACCOUNT_BYTES),
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
  return networkFee({ rentLamports: holds ? 0 : Number(rent), solPriceUsd: sol });
};

/**
 * What sponsoring a USDC transfer will cost us that we ask for back.
 *
 * The question is about the recipient, not the sender. The sender holds USDC —
 * that is what they are sending — so their account exists; it is the
 * recipient's that may have to be opened, and rent is charged once per account
 * whoever ends up paying it. Asking `quoteFee` instead would read the sender's
 * balances and answer zero every time.
 */
export const quoteTransferFee = async (
  deps: FeeQuoteDeps,
  input: { readonly destination: string },
): Promise<Fee> => {
  const [balances, prices, rent] = await Promise.all([
    deps.chain.tokenBalances(input.destination),
    deps.prices.pricesFor([SOL_MINT]),
    rentFor(deps.chain, TOKEN_ACCOUNT_BYTES),
  ]);

  const sol = prices.get(SOL_MINT)?.usdPricePerToken;
  // No price, no charge — the same rule as a trade. The transfer is fine
  // either way; it is only the repayment that cannot be priced.
  if (sol === undefined || sol.lte(0)) return NO_FEE;

  const holds = balances.some((b) => b.mint === USDC_MINT);
  return transferFee({ rentLamports: holds ? 0 : Number(rent), solPriceUsd: sol });
};
