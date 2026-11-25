import { and, eq, sql } from "drizzle-orm";
import { D, toWire, type Decimal, ZERO } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, loanEvents } from "../db/schema.js";
import { notifyFor } from "../notify/inbox.js";
import { stillFollowed } from "../wallets/active.js";
import type { KaminoLoanDay, KaminoLoanTx } from "./kamino-loans.js";
import { tokenText } from "./events.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A stock Mercury lists, as a loan's history names it. */
export interface ListedStock {
  readonly ticker: string;
  readonly decimals: number;
}

/** One row of a loan's past, ready for `loan_event` and the feed. */
export interface ChainLoanEvent {
  readonly kind: "pledge" | "unpledge" | "borrow" | "repay" | "liquidation";
  readonly signature: string;
  readonly occurredAt: Date;
  /**
   * Dollars borrowed or repaid. On a liquidation, the debt it cleared where
   * Kamino says, else what the shares taken were worth. Null on a pledge or
   * withdrawal.
   */
  readonly usdAmount: Decimal | null;
  readonly ticker: string | null;
  readonly tokensRaw: string | null;
  /** The collateral's price then: "Pledged 10 TSLA at $240.10". */
  readonly priceUsd: Decimal | null;
  readonly debtAfterUsd: Decimal;
  readonly collateralAfterUsd: Decimal;
  /** The asset that moved, for the feed row: USDC for money, the stock for collateral. */
  readonly mint: string;
  readonly title: string;
  readonly subtitle: string | null;
}

const KIND = {
  deposit: "pledge",
  withdraw: "unpledge",
  borrow: "borrow",
  repay: "repay",
  liquidate: "liquidation",
} as const;

const money = (d: Decimal) => `$${d.toDecimalPlaces(2).toFixed(2)}`;

/**
 * How a row changes what is owed and what is pledged, in dollars at the time.
 *
 * A liquidation comes as two legs of one transaction: the debt it repaid, in
 * the money lent, and the collateral it took. Each counts on its own side.
 */
const delta = (
  t: KaminoLoanTx,
  usdcMint: string,
): { readonly debt: Decimal; readonly collateral: Decimal } => {
  if (t.action === "liquidate" && t.mint === usdcMint) return { debt: t.valueUsd.neg(), collateral: ZERO };
  switch (t.action) {
    case "borrow":
      return { debt: t.valueUsd, collateral: ZERO };
    case "repay":
      return { debt: t.valueUsd.neg(), collateral: ZERO };
    case "deposit":
      return { debt: ZERO, collateral: t.valueUsd };
    case "withdraw":
    case "liquidate":
      return { debt: ZERO, collateral: t.valueUsd.neg() };
    default:
      return { debt: ZERO, collateral: ZERO };
  }
};

const atLeastZero = (d: Decimal) => (d.lt(0) ? ZERO : d);

/**
 * The position straight after each row, from Kamino's daily closes.
 *
 * Kamino keeps the loan's state once a day, not after each transaction. So
 * each row reads the close after it and takes back what happened between the
 * two; a row after the last close reads the last close and adds what happened
 * since. Interest within the day is the only thing not counted, which is cents
 * on a loan of thousands. A loan with no closes at all starts from nothing.
 */
export const positionsAfter = (
  txs: readonly KaminoLoanTx[],
  days: readonly KaminoLoanDay[],
  usdcMint = "",
): readonly { readonly debt: Decimal; readonly collateral: Decimal }[] =>
  txs.map((t, i) => {
    const close = days.find((d) => d.at.getTime() >= t.at.getTime());
    if (close !== undefined) {
      let debt = close.debtUsd;
      let collateral = close.collateralUsd;
      for (const later of txs.slice(i + 1)) {
        if (later.at.getTime() > close.at.getTime()) break;
        const d = delta(later, usdcMint);
        debt = debt.sub(d.debt);
        collateral = collateral.sub(d.collateral);
      }
      return { debt: atLeastZero(debt), collateral: atLeastZero(collateral) };
    }
    const last = days.at(-1);
    let debt = last?.debtUsd ?? ZERO;
    let collateral = last?.collateralUsd ?? ZERO;
    for (const earlier of txs.slice(0, i + 1)) {
      if (last !== undefined && earlier.at.getTime() <= last.at.getTime()) continue;
      const d = delta(earlier, usdcMint);
      debt = debt.add(d.debt);
      collateral = collateral.add(d.collateral);
    }
    return { debt: atLeastZero(debt), collateral: atLeastZero(collateral) };
  });

/**
 * A linked wallet's loan history as ledger rows: each pledge at its price
 * then, each withdrawal, borrow and repay, and anything Kamino sold to clear
 * the debt. Worded as Mercury's own loan rows are, so the feed and the loan
 * screen read the same whichever app the loan was worked in.
 *
 * The account's creation is not a row: the first pledge is the loan opening,
 * and its receipt says so. A transaction with two rows of one kind (two
 * pledges in one go) keeps them as one, as the ledger's key does, except a
 * liquidation, which is one row per stock it took (the ledger's key has the
 * stock for a liquidation), each with its share of what was repaid.
 */
export const planChainLoan = (
  txs: readonly KaminoLoanTx[],
  days: readonly KaminoLoanDay[],
  stocks: ReadonlyMap<string, ListedStock>,
  usdcMint: string,
): readonly ChainLoanEvent[] => {
  const after = positionsAfter(txs, days, usdcMint);
  const out: ChainLoanEvent[] = [];
  const seen = new Set<string>();
  // A liquidation's debt leg, by transaction: what it repaid is what the shares were sold for.
  const repaidBy = new Map<string, Decimal>();
  for (const t of txs) {
    if (t.action === "liquidate" && t.mint === usdcMint) {
      repaidBy.set(t.signature, (repaidBy.get(t.signature) ?? ZERO).add(t.amount));
    }
  }
  // A transaction whose collateral leg names a stock: its debt leg is told on that row.
  const told = new Set(
    txs
      .filter((t) => t.action === "liquidate" && t.mint !== null && t.mint !== usdcMint)
      .map((t) => t.signature),
  );
  /*
   * A liquidation can take more than one stock in one transaction. Each is its
   * own sale, with its own row, so each stock's realised P&L is its own. What
   * the transaction repaid is split between them by what each stock's shares
   * were worth then, the last taking what rounding leaves so the total is
   * exactly what was repaid. One stock in two legs of the same transaction is
   * one row, with both legs' shares.
   */
  const collateralLegs = new Map<string, Map<string, { amount: Decimal; value: Decimal }>>();
  for (const t of txs) {
    if (t.action !== "liquidate" || t.mint === null || t.mint === usdcMint) continue;
    const legs = collateralLegs.get(t.signature) ?? new Map<string, { amount: Decimal; value: Decimal }>();
    const had = legs.get(t.mint);
    legs.set(t.mint, {
      amount: (had?.amount ?? ZERO).add(t.amount),
      value: (had?.value ?? ZERO).add(t.valueUsd),
    });
    collateralLegs.set(t.signature, legs);
  }
  const repaidFor = (signature: string, mint: string): Decimal | null => {
    const repaid = repaidBy.get(signature);
    if (repaid === undefined) return null;
    const legs = [...(collateralLegs.get(signature)?.entries() ?? [])];
    if (legs.length <= 1) return repaid;
    const total = legs.reduce((sum, [, l]) => sum.add(l.value), ZERO);
    const shareOf = (l: { value: Decimal }) =>
      total.gt(0) ? repaid.mul(l.value).div(total) : repaid.div(legs.length);
    const last = legs[legs.length - 1]![0];
    if (mint !== last) return shareOf(legs.find(([m]) => m === mint)![1]);
    return legs.slice(0, -1).reduce((left, [, l]) => left.sub(shareOf(l)), repaid);
  };
  txs.forEach((t, i) => {
    if (t.action === "create" || t.mint === null) return;
    if (t.action === "liquidate" && t.mint === usdcMint) {
      if (told.has(t.signature) || seen.has(`${t.signature}:liquidation`)) return;
      // Kamino named only the debt it repaid: still a liquidation, and still off the debt.
      seen.add(`${t.signature}:liquidation`);
      const repaid = repaidBy.get(t.signature)!;
      out.push({
        kind: "liquidation",
        signature: t.signature,
        occurredAt: t.at,
        debtAfterUsd: after[i]!.debt,
        collateralAfterUsd: after[i]!.collateral,
        mint: t.mint,
        usdAmount: repaid,
        ticker: null,
        tokensRaw: null,
        priceUsd: null,
        title: "Sold by Kamino",
        subtitle: `Collateral sold to repay ${money(repaid)} of the loan`,
      });
      return;
    }
    const kind = KIND[t.action];
    // A liquidation is one row per stock it took; anything else, one row per kind, as the ledger's key is.
    const key = kind === "liquidation" ? `${t.signature}:${kind}:${t.mint}` : `${t.signature}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    const position = after[i]!;
    const base = {
      kind,
      signature: t.signature,
      occurredAt: t.at,
      debtAfterUsd: position.debt,
      collateralAfterUsd: position.collateral,
      mint: t.mint,
    };
    if (kind === "borrow" || kind === "repay") {
      // USDC is the dollar: its amount is what was lent or paid back, to the cent.
      const usd = t.mint === usdcMint ? t.amount : t.valueUsd;
      out.push({
        ...base,
        usdAmount: usd,
        ticker: null,
        tokensRaw: null,
        priceUsd: null,
        title: kind === "borrow" ? "Borrowed USDC" : "Repaid loan",
        subtitle: kind === "borrow" ? "Against collateral" : "Repayment",
      });
      return;
    }
    const stock = stocks.get(t.mint);
    const ticker = stock?.ticker ?? t.symbol;
    const leg = kind === "liquidation" ? collateralLegs.get(t.signature)?.get(t.mint) : undefined;
    const amount = leg?.amount ?? t.amount;
    const tokensRaw = stock === undefined ? null : amount.mul(D(10).pow(stock.decimals)).floor().toFixed();
    const shares = tokensRaw === null ? amount.toString() : tokenText(tokensRaw, stock!.decimals);
    const at = t.priceUsd.gt(0) ? ` at ${money(t.priceUsd)}` : "";
    const repaid = kind === "liquidation" ? repaidFor(t.signature, t.mint) : null;
    out.push({
      ...base,
      usdAmount: kind === "liquidation" ? (repaid ?? leg?.value ?? t.valueUsd) : null,
      ticker,
      tokensRaw,
      priceUsd: t.priceUsd.gt(0) ? t.priceUsd : null,
      title:
        kind === "pledge"
          ? "Added collateral"
          : kind === "unpledge"
            ? "Withdrew collateral"
            : "Sold by Kamino",
      subtitle:
        repaid === null
          ? `${shares} ${ticker}${at}`
          : `${shares} ${ticker}${at} · repaid ${money(repaid)} of the loan`,
    });
  });
  return out;
};

/** A liquidation just written that is news: the person is told, in the inbox here and by mail by the caller. */
export interface NewLiquidation {
  readonly event: ChainLoanEvent;
  readonly activityId: string;
}

/**
 * Writes a loan's history to the ledger and the feed, marked as read from the
 * chain. Idempotent on the ledger's own key, so a row Mercury already recorded
 * (the wallet borrowed through Mercury) is kept as it was, and reading the
 * history again writes nothing.
 *
 * Little of it is news: it already happened, mostly by the person's own hand.
 * A liquidation is the exception. A bot sends it, so nothing in Mercury saw it
 * coming in, and it is the one event in a loan that costs the person money
 * without their doing anything. One at or after `newsSince` goes to the inbox,
 * in the same transaction as its feed row, and is returned for the caller to
 * mail. Older ones (a wallet's past, read when it was linked) stay quiet.
 */
export async function recordChainLoan(
  db: Db,
  owner: { readonly userId: string; readonly walletId: string },
  events: readonly ChainLoanEvent[],
  newsSince: Date | null = null,
): Promise<{ written: number; liquidations: readonly NewLiquidation[] }> {
  if (events.length === 0) return { written: 0, liquidations: [] };
  return db.transaction(async (tx) => {
    let written = 0;
    const liquidations: NewLiquidation[] = [];
    // A wallet unlinked since its loan was read is frozen as it was: nothing written, nobody told.
    if (!(await stillFollowed(tx, owner.walletId))) return { written, liquidations };
    for (const e of events) {
      const [row] = await tx
        .insert(loanEvents)
        .values({
          userId: owner.userId,
          walletId: owner.walletId,
          kind: e.kind,
          usdAmount: e.usdAmount === null ? null : toWire(e.usdAmount),
          ticker: e.ticker,
          tokensRaw: e.tokensRaw,
          borrowApy: null,
          debtAfterUsd: toWire(e.debtAfterUsd),
          collateralAfterUsd: toWire(e.collateralAfterUsd),
          priceUsd: e.priceUsd === null ? null : toWire(e.priceUsd),
          originSource: "chain",
          txSignature: e.signature,
          occurredAt: e.occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: loanEvents.id });
      if (row === undefined) {
        if (e.kind === "liquidation") await correctLiquidation(tx, owner.walletId, e);
        continue;
      }
      written += 1;
      const [feed] = await tx
        .insert(activities)
        .values({
          userId: owner.userId,
          walletId: owner.walletId,
          kind: e.kind,
          occurredAt: e.occurredAt,
          title: e.title,
          subtitle: e.subtitle,
          amountUsd: e.usdAmount === null ? null : toWire(e.usdAmount),
          refTable: "loan_event",
          refId: row.id,
          txSignature: e.signature,
          mint: e.mint,
        })
        .onConflictDoNothing()
        .returning({ id: activities.id });
      if (
        e.kind === "liquidation" &&
        feed !== undefined &&
        newsSince !== null &&
        e.occurredAt.getTime() >= newsSince.getTime()
      ) {
        // One inbox entry per sale, however many stocks it took.
        if (!liquidations.some((l) => l.event.signature === e.signature)) {
          await notifyFor(tx, owner.userId, [{ activityId: feed.id, kind: "loan_alert" }]);
        }
        liquidations.push({ event: e, activityId: feed.id });
      }
    }
    return { written, liquidations };
  });
}

/**
 * A liquidation read before it was kept one row per stock: a sale that took
 * two stocks was one row, carrying everything the sale repaid as the first
 * stock's proceeds. Read again, that row is brought to its own share, with its
 * shares and feed row, and its realised P&L is worked out again from it. A row
 * already right, or one Mercury recorded, is left as it is.
 */
async function correctLiquidation(tx: Tx, walletId: string, e: ChainLoanEvent): Promise<void> {
  if (e.usdAmount === null) return;
  const amount = toWire(e.usdAmount);
  const fixed = await tx
    .update(loanEvents)
    .set({ usdAmount: amount, tokensRaw: e.tokensRaw, realisedPnlUsd: null })
    .where(
      and(
        eq(loanEvents.walletId, walletId),
        eq(loanEvents.txSignature, e.signature),
        eq(loanEvents.kind, "liquidation"),
        eq(loanEvents.originSource, "chain"),
        sql`coalesce(${loanEvents.ticker}, '') = ${e.ticker ?? ""}`,
        sql`(${loanEvents.usdAmount} is distinct from ${amount}::numeric(38, 18) or ${loanEvents.tokensRaw} is distinct from ${e.tokensRaw})`,
      ),
    )
    .returning({ id: loanEvents.id });
  for (const { id } of fixed) {
    await tx
      .update(activities)
      .set({ amountUsd: amount, subtitle: e.subtitle })
      .where(and(eq(activities.refTable, "loan_event"), eq(activities.refId, id)));
  }
}
