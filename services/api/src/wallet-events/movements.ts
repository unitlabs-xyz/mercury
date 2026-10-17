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
  /**
   * Set when the money moved between this wallet and one of its own Glider
   * smart accounts. The row still reads as a transfer in the feed — it is one,
   * from the wallet's side — but it is not cash crossing the account's edge,
   * and `readFlows` leaves it out of the performance line because of this.
   */
  readonly basketPortfolioId?: string;
  readonly signature: string;
  readonly occurredAt: Date;
}

export interface MovementContext {
  readonly wallet: string;
  /** Used only when the node reports no block time for the slot. */
  readonly now: Date;
  /**
   * Kamino's lending program. A transaction that touched it is a loan action,
   * and `POST /v1/borrow/confirm` writes the row for it.
   */
  readonly lendingProgram: string;
  /**
   * This wallet's own Glider smart accounts, by address, to the portfolio each
   * belongs to.
   *
   * Without them, funding a basket is indistinguishable from sending money
   * away: USDC leaves and nothing else in the wallet moves. Counted as a
   * withdrawal it printed a gain on the performance chart equal to the amount
   * funded, because net worth did not drop — the money came back as basket
   * value. The funding and exit reconcilers fix the row afterwards, but
   * afterwards is a race, and never at all for a funding nobody confirmed.
   */
  readonly basketAccounts?: ReadonlyMap<string, string>;
  /**
   * The relayer, when sponsorship is on.
   *
   * A sponsored transfer repays the relayer its rent in the same message, so
   * the wallet's USDC falls by the amount sent *plus* that charge. Netted, the
   * feed would report a $20 transfer as "Sent cash $20.25" — the charge read
   * as money sent, which is the same mistake the share price used to make
   * before `planFill` learned to take it out.
   */
  readonly relayer?: string;
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
/**
 * The portfolio behind the basket account whose USDC moved here, if one did.
 *
 * Only an account whose own USDC balance changed counts. A smart account can
 * appear in a transaction's keys without taking part in its cash, and matching
 * on that would mark an ordinary deposit as internal.
 */
const basketFor = (tx: TransactionDetail, ctx: MovementContext): string | undefined => {
  if (ctx.basketAccounts === undefined) return undefined;
  for (const [address, portfolioId] of ctx.basketAccounts) {
    if (address === ctx.wallet) continue;
    const delta = sumOwned(tx.postTokens, address, USDC_MINT) - sumOwned(tx.preTokens, address, USDC_MINT);
    if (delta !== 0n) return portfolioId;
  }
  return undefined;
};

/**
 * What of this wallet's outgoing USDC was repayment to the relayer, not a
 * transfer.
 *
 * Nothing unless the relayer gained USDC in the same transaction, which only
 * a sponsored transfer makes it do. And nothing if the relayer's gain is the
 * whole of what left: somebody deliberately sending dollars to that address is
 * making a transfer, not paying a fee, and reporting it as $0 would be worse
 * than the error this exists to fix.
 */
const sponsorCharge = (
  tx: TransactionDetail,
  ctx: Pick<MovementContext, "wallet" | "relayer">,
  movedOut: bigint,
): bigint => {
  if (ctx.relayer === undefined || ctx.relayer === ctx.wallet) return 0n;
  const gain =
    sumOwned(tx.postTokens, ctx.relayer, USDC_MINT) - sumOwned(tx.preTokens, ctx.relayer, USDC_MINT);
  return gain > 0n && gain < movedOut ? gain : 0n;
};

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

  /*
   * A loan is not a deposit, and a repayment is not a withdrawal.
   *
   * Kamino pays a borrower into their own wallet, so a borrow looks from here
   * exactly like somebody sending themselves money: dollars arrive, nothing
   * else in the wallet moves, and this would write "Added cash". The row that
   * belongs in the feed says what actually happened, names the collateral, and
   * has a `loan_event` behind it with the rate and the resulting position — and
   * it is written by `POST /v1/borrow/confirm`, not from a balance.
   *
   * Same reasoning as the swap rule above: when a transaction did something
   * larger, its cash movement is part of that thing and not an event of its own.
   */
  if (tx.accountKeys.includes(ctx.lendingProgram)) return moved;

  if (usdc !== 0n) {
    // Which of this wallet's own basket accounts was on the other end, if any.
    // Read from the balances rather than the account keys: a smart account is
    // named in plenty of transactions it took no money in.
    const basket = basketFor(tx, ctx);
    // Only on the way out. The relayer gaining dollars while this wallet also
    // gains them is not a charge on this movement, and subtracting it would
    // understate a deposit.
    const charge = usdc < 0n ? sponsorCharge(tx, ctx, abs(usdc)) : 0n;
    const amount = scaled(abs(usdc) - charge, USDC_DECIMALS);
    moved.push({
      mint: USDC_MINT,
      kind: usdc > 0n ? "transfer_in" : "transfer_out",
      title:
        basket === undefined
          ? usdc > 0n
            ? "Added cash"
            : "Sent cash"
          : usdc > 0n
            ? "Cash from a basket"
            : "Cash to a basket",
      subtitle:
        charge === 0n ? null : `Plus $${trim(scaled(charge, USDC_DECIMALS), 2)} to open their USDC account`,
      // USDC is a dollar. No price lookup, and none to be wrong about.
      amountUsd: amount,
      ...(basket === undefined ? {} : { basketPortfolioId: basket }),
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

/**
 * Who was on the other side of a transfer, and what a send paid to open their
 * account: what a receipt says about a "Sent cash" or "Added cash" row.
 *
 * Not stored on the row, because nothing needed it until a receipt did, and
 * every past transfer can answer it from its own transaction. The other side
 * is whoever's balance of the same asset moved the opposite way, the most —
 * never the relayer, which takes its charge in the same message and is not who
 * the money was for. Null when nobody's did, which is the honest answer for a
 * transaction this cannot read plainly.
 */
export const transferParties = (
  tx: TransactionDetail,
  ctx: { readonly wallet: string; readonly mint: string; readonly relayer?: string },
): { readonly counterparty: string | null; readonly accountSetupUsd: Decimal | null } => {
  const sol = ctx.mint === NATIVE_SOL_MINT;
  // The fee payer's lamports carry the network fee, which was not sent to anybody.
  const lamports = (i: number) =>
    (tx.postLamports[i] ?? 0n) - (tx.preLamports[i] ?? 0n) + (i === 0 ? tx.feeLamports : 0n);
  const change = (who: string) =>
    sol
      ? tx.accountKeys.includes(who)
        ? lamports(tx.accountKeys.indexOf(who))
        : 0n
      : sumOwned(tx.postTokens, who, ctx.mint) - sumOwned(tx.preTokens, who, ctx.mint);

  const mine = change(ctx.wallet);
  const others = sol
    ? tx.accountKeys
    : [...tx.preTokens, ...tx.postTokens].filter((e) => e.mint === ctx.mint).map((e) => e.owner);

  let counterparty: string | null = null;
  let most = 0n;
  for (const who of new Set(others)) {
    if (who === null || who === ctx.wallet || who === ctx.relayer) continue;
    const moved = change(who);
    if (moved === 0n || moved > 0n === mine > 0n || abs(moved) <= most) continue;
    most = abs(moved);
    counterparty = who;
  }

  const charge = ctx.mint === USDC_MINT && mine < 0n ? sponsorCharge(tx, ctx, abs(mine)) : 0n;
  return { counterparty, accountSetupUsd: charge === 0n ? null : scaled(charge, USDC_DECIMALS) };
};
