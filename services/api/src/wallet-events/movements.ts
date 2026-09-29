import { D, type Decimal } from "@mercury/core";
import { USDC_DECIMALS, USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";

/**
 * Native SOL, recorded under the wrapped-SOL mint.
 *
 * The column is a mint and native SOL has none. This is the identifier every
 * Solana tool already uses for it, and the unique index on
 * (user_id, tx_signature, mint) needs a non-null value or two passes could
 * write the same movement twice.
 */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

const SOL_DECIMALS = 9;

export interface Movement {
  readonly mint: string;
  readonly kind: "transfer_in" | "transfer_out";
  readonly title: string;
  readonly subtitle: string | null;
  /** Null unless the asset is itself a dollar. Nothing here invents a price. */
  readonly amountUsd: Decimal | null;
  readonly signature: string;
  readonly occurredAt: Date;
}

export interface MovementContext {
  readonly wallet: string;
  /** Used only when the node reports no block time for the slot. */
  readonly now: Date;
}

const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/** Trailing zeros, but only after a decimal point: "100" must not become "1". */
const trim = (v: Decimal, dp: number): string => {
  const s = v.toDecimalPlaces(dp).toFixed();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

const sumOwned = (entries: readonly TokenBalanceEntry[], owner: string, mint: string): bigint =>
  entries.reduce((total, e) => (e.owner === owner && e.mint === mint ? total + e.rawAmount : total), 0n);

/**
 * What one transaction did to one wallet, in cash terms.
 *
 * Pure: no database, no clock, no network. Every rule here is a millisecond to
 * test, which is what a file about money should cost to be sure of.
 *
 * Balances are summed per side rather than matched entry by entry, which makes
 * the two hard cases free. An account created inside the transaction has no
 * `pre` entry at all — the first-deposit case — and contributes zero to the pre
 * sum, which is the right answer. A wallet holding two accounts for one mint
 * falls out of the same sum.
 */
export function movementsIn(tx: TransactionDetail, ctx: MovementContext): readonly Movement[] {
  const occurredAt = tx.blockTime === null ? ctx.now : new Date(tx.blockTime * 1000);
  const moved: Movement[] = [];

  const usdc = sumOwned(tx.postTokens, ctx.wallet, USDC_MINT) - sumOwned(tx.preTokens, ctx.wallet, USDC_MINT);

  /*
   * A swap is not a cash transfer.
   *
   * Dollars leaving this wallet while a token arrives in it is one event — a
   * trade — and the order that placed it writes the row, with the shares and
   * the price on it. Reporting the cash leg here as well would put "Sent cash
   * $100" in the feed beside "Bought NVDA", two rows for one thing, and the
   * unique index would not catch it because the two carry different mints.
   *
   * The same reasoning the SOL rule below already uses: when a transaction did
   * something larger, its cash movement is part of that thing and not an event
   * of its own.
   *
   * A trade nobody confirmed therefore has no row at all until it is confirmed,
   * which is recoverable — a duplicate in the feed is not.
   */
  const tradedAnotherToken = [...new Set([...tx.preTokens, ...tx.postTokens].map((e) => e.mint))].some(
    (mint) =>
      mint !== USDC_MINT &&
      sumOwned(tx.postTokens, ctx.wallet, mint) !== sumOwned(tx.preTokens, ctx.wallet, mint),
  );
  if (usdc !== 0n && tradedAnotherToken) return moved;

  if (usdc !== 0n) {
    moved.push({
      mint: USDC_MINT,
      kind: usdc > 0n ? "transfer_in" : "transfer_out",
      title: usdc > 0n ? "Added cash" : "Sent cash",
      subtitle: null,
      // USDC is a dollar. No price lookup, and none to be wrong about.
      amountUsd: scaled(abs(usdc), USDC_DECIMALS),
      signature: tx.signature,
      occurredAt,
    });
    // Rent for a new token account and the fee for the deposit are plumbing for
    // the cash event, not a second event. A SOL row is written only when a SOL
    // change is the whole of what happened to this wallet.
    return moved;
  }

  const index = tx.accountKeys.indexOf(ctx.wallet);
  if (index < 0) return moved;
  const pre = tx.preLamports[index];
  const post = tx.postLamports[index];
  if (pre === undefined || post === undefined) return moved;

  // The fee payer is the first account key, and its balance change includes the
  // fee. Without adding it back, every swap would say "Sent 0.000005 SOL".
  const delta = post - pre + (index === 0 ? tx.feeLamports : 0n);
  if (delta === 0n) return moved;

  moved.push({
    mint: NATIVE_SOL_MINT,
    kind: delta > 0n ? "transfer_in" : "transfer_out",
    title: delta > 0n ? "Received SOL" : "Sent SOL",
    // The quantity, not a price: the block time is often hours old, and pricing
    // it at today's price would put a wrong number on a past event.
    subtitle: `${trim(scaled(abs(delta), SOL_DECIMALS), SOL_DECIMALS)} SOL`,
    amountUsd: null,
    signature: tx.signature,
    occurredAt,
  });

  return moved;
}
