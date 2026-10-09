import { D, ZERO, type Decimal } from "@mercury/core";
import { USDC_DECIMALS, USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";

export interface FillContext {
  readonly wallet: string;
  readonly side: "buy" | "sell";
  /** The wrapper the order chose. */
  readonly mint: string;
  readonly decimals: number;
  /** Shares per token. The lot records shares as they were at acquisition. */
  readonly multiplier: Decimal;
  /**
   * The relayer, on a sponsored trade.
   *
   * Its USDC leg of this transaction is the charge for sponsoring, which rides
   * in the same transaction as the swap — so without knowing who to look for,
   * the charge is indistinguishable from money the swap spent. Absent on an
   * unsponsored trade, where there is no charge to separate.
   */
  readonly relayer?: string | undefined;
  /** Used only when the node reports no block time for the slot. */
  readonly now: Date;
}

export interface Fill {
  readonly kind: "filled";
  /** Tokens that moved, in the mint's smallest unit. Positive whichever way they went. */
  readonly tokensRaw: bigint;
  readonly tokens: Decimal;
  /** What those tokens are in real shares, at the multiplier in force. */
  readonly shares: Decimal;
  /**
   * What the swap itself was worth: dollars that bought shares on a buy,
   * dollars the shares produced on a sell. Always positive, and never includes
   * `feeUsd` on either side — the charge bought no shares, so a cost basis or
   * a profit computed from it would be wrong by exactly the fee.
   */
  readonly usd: Decimal;
  /** The relayer's charge for sponsoring, from its own leg. Zero when unsponsored. */
  readonly feeUsd: Decimal;
  readonly pricePerShare: Decimal;
  readonly occurredAt: Date;
}

export interface NotAFill {
  readonly kind: "not_a_fill";
  readonly detail: string;
}

const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

const sumOwned = (entries: readonly TokenBalanceEntry[], owner: string, mint: string): bigint =>
  entries.reduce((total, e) => (e.owner === owner && e.mint === mint ? total + e.rawAmount : total), 0n);

const netFor = (tx: TransactionDetail, owner: string, mint: string): bigint =>
  sumOwned(tx.postTokens, owner, mint) - sumOwned(tx.preTokens, owner, mint);

/**
 * What the relayer took out of this transaction for sponsoring it.
 *
 * Read from the relayer's own balance rather than from the fee we quoted, for
 * the same reason the rest of this file reads the wallet's: a quote is a
 * prediction, and the transaction is the fact. Only a gain counts — a relayer
 * whose USDC went down did not charge anything, and reading that as a negative
 * fee would credit the trader with dollars nobody paid them.
 */
const chargeUsd = (tx: TransactionDetail, ctx: FillContext): Decimal => {
  if (ctx.relayer === undefined || ctx.relayer === ctx.wallet) return ZERO;
  const delta = netFor(tx, ctx.relayer, USDC_MINT);
  return delta > 0n ? scaled(delta, USDC_DECIMALS) : ZERO;
};

/**
 * What a transaction actually did for this order, in shares and dollars.
 *
 * Read from the wallet's own balances before and after, never from the quote
 * that preceded it. The quote is a prediction; a lot written from a prediction
 * records a cost the user did not pay, and every profit figure computed from it
 * afterwards is wrong by the difference. Slippage exists precisely so that the
 * two can differ, so the books follow the chain.
 *
 * Balances are summed per side rather than matched entry by entry, for the same
 * reason `movementsIn` does it: a token account created inside this very
 * transaction — which is every first purchase of a wrapper — has no `pre` entry
 * at all, and contributes zero to the pre sum, which is the right answer.
 *
 * The sponsorship charge is separated out rather than left in the price. A buy
 * moves `usd + feeUsd` out of the wallet and a sell leaves `usd - feeUsd` in
 * it, so taking the wallet's delta as the trade made the fee part of the share
 * price: a position opened at a loss of exactly the fee, and a sale gave up its
 * fee twice over. The fee is a cost of trading and it is reported as one.
 *
 * Pure. No database, no clock, no network.
 */
export function planFill(tx: TransactionDetail, ctx: FillContext): Fill | NotAFill {
  if (!tx.succeeded) {
    return { kind: "not_a_fill", detail: "That transaction did not succeed on chain." };
  }

  const tokenDelta = netFor(tx, ctx.wallet, ctx.mint);
  const usdcDelta = netFor(tx, ctx.wallet, USDC_MINT);
  const buying = ctx.side === "buy";

  // The legs have to point the right way round. A transaction where the tokens
  // moved but the dollars did not is not this order being filled — it is a
  // transfer, or somebody else's transaction, or the wrong signature pasted in.
  const tokensMoved = buying ? tokenDelta > 0n : tokenDelta < 0n;
  const dollarsMoved = buying ? usdcDelta < 0n : usdcDelta > 0n;
  if (!tokensMoved || !dollarsMoved) {
    return {
      kind: "not_a_fill",
      detail: buying
        ? "That transaction did not buy this stock with dollars from this wallet."
        : "That transaction did not sell this stock for dollars into this wallet.",
    };
  }

  const tokensRaw = abs(tokenDelta);
  const tokens = scaled(tokensRaw, ctx.decimals);
  const shares = tokens.mul(ctx.multiplier);
  const feeUsd = chargeUsd(tx, ctx);
  // The wallet's own movement, which on a buy is what the swap spent plus the
  // charge and on a sell is what the swap made less the charge.
  const moved = scaled(abs(usdcDelta), USDC_DECIMALS);
  const usd = buying ? moved.sub(feeUsd) : moved.add(feeUsd);

  // A multiplier of zero would be a broken mint read, and dividing by it would
  // write an infinite price into the books.
  if (shares.lte(ZERO)) {
    return { kind: "not_a_fill", detail: "That transaction moved no shares." };
  }

  // A buy whose whole movement was the charge bought nothing, and a zero price
  // per share in the books is a position that reports its entire value as
  // profit. It cannot happen on a trade that filled, so it is a refusal rather
  // than a figure.
  if (usd.lte(ZERO)) {
    return { kind: "not_a_fill", detail: "That transaction moved no dollars into shares." };
  }

  return {
    kind: "filled",
    tokensRaw,
    tokens,
    shares,
    usd,
    feeUsd,
    pricePerShare: usd.div(shares),
    occurredAt: tx.blockTime === null ? ctx.now : new Date(tx.blockTime * 1000),
  };
}
