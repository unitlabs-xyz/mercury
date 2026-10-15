import { D, type Decimal } from "@mercury/core";

/**
 * What the network costs the relayer, priced in the currency the buyer holds.
 *
 * The buyer is asked for USDC and nothing else. Requiring a second asset they
 * did not choose, cannot spend and must acquire elsewhere is the cliff this
 * removes; the relayer pays the SOL and is repaid in the same transaction.
 */

/** One signature. The relayer's; the buyer's costs nothing extra. */
export const SIGNATURE_LAMPORTS = 5_000;

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface FeeInput {
  /**
   * Rent for the token account this has to open, in lamports: zero when it
   * opens none.
   *
   * Non-zero only the first time a wallet holds a given token. Rent is charged
   * once per account, so charging it again would be charging for nothing. The
   * figure is the node's, by the account's size (see `rent.ts`): mainnet's
   * rate has moved under a constant here before.
   */
  readonly rentLamports: number;
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
  priced(SIGNATURE_LAMPORTS + input.rentLamports, input.solPriceUsd);

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
 * account moves 1,488,440 lamports (October 2026) out of the relayer and into
 * an account the sender named — it is not a fee at all but a transfer of our
 * balance to somewhere we chose nothing about. That is precisely the drain
 * `SponsorPolicy` warns of while the program list is open, so it is charged,
 * and charged inside the same message so it cannot be dropped.
 */
export const transferFee = (input: FeeInput): Fee =>
  input.rentLamports > 0 ? priced(input.rentLamports, input.solPriceUsd) : { usdc: D(0), lamports: 0 };

/**
 * Mercury's own fee on a trade: `bps` of what it is worth, in USDC.
 *
 * The worth is the dollars the buyer pays on a buy and the dollars the shares
 * fetch on a sell — the figure on the ticket either way, so "0.5%" means 0.5%
 * of a number the person can see.
 *
 * Rounded down to the cent, the opposite way from the network cost. That one
 * rounds up because SOL moves under it and a hair short fails the trade; this
 * one is a rate we state, and a rounded-up cent would charge more than it says.
 */
export const tradingFee = (worthUsd: Decimal, bps: number): Decimal =>
  worthUsd.mul(bps).div(10_000).div(CENT).floor().mul(CENT);

/**
 * Everything a trade's one USDC transfer carries, and what each part is for.
 *
 * One transfer rather than two, both to the relayer's USDC account. A second
 * transfer would name a second destination, and a swap route already needs
 * lookup tables to fit in 1232 bytes; a bigger amount costs no bytes at all.
 * The parts are kept apart here so the ticket can show them apart and the
 * books can tell revenue from repaid gas.
 */
export interface TradeCharge {
  /** The whole transfer: what comes out of the amount on a buy, or the proceeds on a sell. */
  readonly usdc: Decimal;
  readonly lamports: number;
  /** What repays the relayer for the network. */
  readonly network: Decimal;
  /** Mercury's fee, at `mercuryBps`. */
  readonly mercury: Decimal;
  readonly mercuryBps: number;
}

export const tradeCharge = (network: Fee, worthUsd: Decimal, bps: number): TradeCharge => {
  const mercury = tradingFee(worthUsd, bps);
  return {
    usdc: network.usdc.add(mercury),
    lamports: network.lamports,
    network: network.usdc,
    mercury,
    mercuryBps: bps,
  };
};

/**
 * What the buy is actually worth once the network has been paid.
 *
 * The fee comes out of the amount rather than being added to it. A buyer
 * holding exactly $5 can never pay $5.19, so adding on top makes a whole
 * balance unspendable and makes "Max" fail by construction.
 */
export const investable = (amountUsd: Decimal, fee: Fee): Decimal => amountUsd.sub(fee.usdc);
