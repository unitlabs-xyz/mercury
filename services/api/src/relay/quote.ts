import { D } from "@mercury/core";
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import type { ChainHistory, ChainReader } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import { USDC_MINT } from "@mercury/chain";
import { networkFee, transferFee, type Fee } from "./fee.js";
import { STOCK_ACCOUNT_BYTES, TOKEN_ACCOUNT_BYTES, rentFor } from "../rent.js";

/** Native SOL trades under the wrapped-SOL mint, which is how it is priced. */
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface FeeQuoteDeps {
  readonly chain: ChainReader;
  readonly prices: PriceBoard;
  /**
   * Every token account an owner holds, empty ones included. A balance read
   * leaves out an emptied account, which still exists and owes no rent again:
   * without this, re-buying a stock sold to nothing, or selling into a USDC
   * account spent to nothing, was charged rent for an account already there.
   */
  readonly history?: Pick<ChainHistory, "ownedTokenAccounts">;
}

/**
 * Whether `owner`'s associated token account for `mint` exists: the one
 * account a sponsored build opens (`getCreateAssociatedTokenIdempotent`, paid
 * by the relayer), and so the one whose rent is owed when it is missing.
 *
 * Not "any account of the mint". An owner can hold a second, non-associated
 * account for a mint, empty and costing them nothing to keep; read as "already
 * has one", it waived the rent while the build still opened the associated
 * account on the relayer's SOL, which the owner could then close and keep.
 * Repeated, that was the relayer's SOL drained a rent at a time. An emptied
 * associated account still counts: it exists, and owes no rent again.
 *
 * Without the list of accounts (and their addresses) there is no telling
 * which one exists, so it is taken as missing: rent charged, in USDC, inside
 * the transaction that opens it, rather than an account sponsored on a guess.
 */
const holdsAssociated = async (deps: FeeQuoteDeps, owner: string, mint: string): Promise<boolean> => {
  const list = deps.history?.ownedTokenAccounts;
  if (list === undefined) return false;
  const rows = (await list.call(deps.history, owner)).filter((r) => r.mint === mint);
  for (const r of rows) {
    const [ata] = await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(mint),
      tokenProgram: address(r.programId),
    });
    if (r.address === ata) return true;
  }
  return false;
};

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
  const [holds, prices, rent] = await Promise.all([
    holdsAssociated(deps, input.owner, input.receivingMint),
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

  // An associated account that exists is already rent-exempt, whatever it holds: no rent owed.
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
  const [holds, prices, rent] = await Promise.all([
    holdsAssociated(deps, input.destination, USDC_MINT),
    deps.prices.pricesFor([SOL_MINT]),
    rentFor(deps.chain, TOKEN_ACCOUNT_BYTES),
  ]);

  const sol = prices.get(SOL_MINT)?.usdPricePerToken;
  // No price, no charge — the same rule as a trade. The transfer is fine
  // either way; it is only the repayment that cannot be priced.
  if (sol === undefined || sol.lte(0)) return NO_FEE;

  return transferFee({ rentLamports: holds ? 0 : Number(rent), solPriceUsd: sol });
};
