import { D, toWire, type Decimal, ZERO } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, loanEvents } from "../db/schema.js";
import type { KaminoLoanDay, KaminoLoanTx } from "./kamino-loans.js";
import { tokenText } from "./events.js";

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
  /** Dollars borrowed or repaid, or what a liquidation took. Null on a pledge or withdrawal. */
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

/** How a row changes what is owed and what is pledged, in dollars at the time. */
const delta = (t: KaminoLoanTx): { readonly debt: Decimal; readonly collateral: Decimal } => {
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
): readonly { readonly debt: Decimal; readonly collateral: Decimal }[] =>
  txs.map((t, i) => {
    const close = days.find((d) => d.at.getTime() >= t.at.getTime());
    if (close !== undefined) {
      let debt = close.debtUsd;
      let collateral = close.collateralUsd;
      for (const later of txs.slice(i + 1)) {
        if (later.at.getTime() > close.at.getTime()) break;
        const d = delta(later);
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
      const d = delta(earlier);
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
 * pledges in one go) keeps them as one, as the ledger's key does.
 */
export const planChainLoan = (
  txs: readonly KaminoLoanTx[],
  days: readonly KaminoLoanDay[],
  stocks: ReadonlyMap<string, ListedStock>,
  usdcMint: string,
): readonly ChainLoanEvent[] => {
  const after = positionsAfter(txs, days);
  const out: ChainLoanEvent[] = [];
  const seen = new Set<string>();
  txs.forEach((t, i) => {
    if (t.action === "create" || t.mint === null) return;
    const kind = KIND[t.action];
    const key = `${t.signature}:${kind}`;
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
    const tokensRaw = stock === undefined ? null : t.amount.mul(D(10).pow(stock.decimals)).floor().toFixed();
    const shares = tokensRaw === null ? t.amount.toString() : tokenText(tokensRaw, stock!.decimals);
    const at = t.priceUsd.gt(0) ? ` at ${money(t.priceUsd)}` : "";
    out.push({
      ...base,
      usdAmount: kind === "liquidation" ? t.valueUsd : null,
      ticker,
      tokensRaw,
      priceUsd: t.priceUsd.gt(0) ? t.priceUsd : null,
      title:
        kind === "pledge"
          ? "Added collateral"
          : kind === "unpledge"
            ? "Withdrew collateral"
            : "Sold by Kamino",
      subtitle: `${shares} ${ticker}${at}`,
    });
  });
  return out;
};

/**
 * Writes a loan's history to the ledger and the feed, marked as read from the
 * chain. Idempotent on the ledger's own key, so a row Mercury already recorded
 * (the wallet borrowed through Mercury) is kept as it was, and reading the
 * history again writes nothing. None of it is news: it already happened.
 */
export async function recordChainLoan(
  db: Db,
  owner: { readonly userId: string; readonly walletId: string },
  events: readonly ChainLoanEvent[],
): Promise<{ written: number }> {
  if (events.length === 0) return { written: 0 };
  return db.transaction(async (tx) => {
    let written = 0;
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
      if (row === undefined) continue;
      written += 1;
      await tx
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
        .onConflictDoNothing();
    }
    return { written };
  });
}
