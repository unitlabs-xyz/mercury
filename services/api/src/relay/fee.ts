import { D, type Decimal } from "@mercury/core";

/**
 * What the network costs the relayer, priced in the currency the buyer holds.
 *
 * The buyer is asked for USDC and nothing else. Requiring a second asset they
 * did not choose, cannot spend and must acquire elsewhere is the cliff this
 * removes; the relayer pays the SOL and is repaid in the same transaction.
 */

/** Rent for one token account, from the rent-exemption minimum for its size. */
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;

/** One signature. The relayer's; the buyer's costs nothing extra. */
export const SIGNATURE_LAMPORTS = 5_000;

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface FeeInput {
  /**
   * Whether this buy has to open a token account to receive the shares into.
   *
   * True only the first time a wallet holds a given stock. Rent is charged
   * once per account, so charging it again would be charging for nothing.
   */
  readonly needsTokenAccount: boolean;
  readonly solPriceUsd: Decimal;
}

export interface Fee {
  /** What the buyer is charged, in USDC. Zero when nothing is owed. */
  readonly usdc: Decimal;
  readonly lamports: number;
}

/*
 * Rounded up to the cent, always.
 *
 * SOL moves between quoting this and building the transaction, and a fee
 * quoted a hair short is an order that fails at the relayer for the price of a
 * rounding error. A cent of slack costs the buyer a cent and costs us a class
 * of failure that would be very hard to read from the outside.
 */
const CENT = D("0.01");

export const networkFee = (input: FeeInput): Fee => {
  const lamports = SIGNATURE_LAMPORTS + (input.needsTokenAccount ? TOKEN_ACCOUNT_RENT_LAMPORTS : 0);
  const exact = D(lamports).div(LAMPORTS_PER_SOL).mul(input.solPriceUsd);
  const usdc = exact.div(CENT).ceil().mul(CENT);
  return { usdc, lamports };
};

/**
 * What the buy is actually worth once the network has been paid.
 *
 * The fee comes out of the amount rather than being added to it. A buyer
 * holding exactly $5 can never pay $5.25, so adding on top makes a whole
 * balance unspendable and makes "Max" fail by construction.
 */
export const investable = (amountUsd: Decimal, fee: Fee): Decimal => amountUsd.sub(fee.usdc);
