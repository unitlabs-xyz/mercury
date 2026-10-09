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

const ceilToCent = (usd: Decimal): Decimal => usd.div(CENT).ceil().mul(CENT);

const priced = (lamports: number, solPriceUsd: Decimal): Fee => ({
  usdc: ceilToCent(D(lamports).div(LAMPORTS_PER_SOL).mul(solPriceUsd)),
  lamports,
});

export const networkFee = (input: FeeInput): Fee =>
  priced(SIGNATURE_LAMPORTS + (input.needsTokenAccount ? TOKEN_ACCOUNT_RENT_LAMPORTS : 0), input.solPriceUsd);

/**
 * What a sponsored transfer charges, which is rent and never the signature.
 *
 * A transfer is not a trade. The signature costs a tenth of a cent and the
 * relayer absorbs it, the way it already absorbs a loan's — asking a sender to
 * repay that much costs more in explanation than it recovers, and it is the
 * difference between "Mercury covers the network fee" and a line of small
 * print on every transfer.
 *
 * Rent is different in kind, not just in size. Opening the recipient's USDC
 * account moves 2,039,280 lamports out of the relayer and into an account the
 * sender named — it is not a fee at all but a transfer of our balance to
 * somewhere we chose nothing about. That is precisely the drain `SponsorPolicy`
 * warns of while the program list is open, so it is charged, and charged inside
 * the same message so it cannot be dropped.
 */
export const transferFee = (input: FeeInput): Fee =>
  input.needsTokenAccount
    ? priced(TOKEN_ACCOUNT_RENT_LAMPORTS, input.solPriceUsd)
    : { usdc: D(0), lamports: 0 };

/**
 * What the buy is actually worth once the network has been paid.
 *
 * The fee comes out of the amount rather than being added to it. A buyer
 * holding exactly $5 can never pay $5.25, so adding on top makes a whole
 * balance unspendable and makes "Max" fail by construction.
 */
export const investable = (amountUsd: Decimal, fee: Fee): Decimal => amountUsd.sub(fee.usdc);
