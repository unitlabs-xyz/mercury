import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { D } from "@mercury/core";
import type { ChainHistory } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, fundingIntents, instruments, loanEvents, lots, orders, tokens } from "../db/schema.js";
import type { ActivityRow } from "../routes/activity.js";
import { transferParties } from "../wallet-events/movements.js";
import { logger } from "../log/index.js";
import { loanReceipt, tradeReceipt, type ReceiptDetail } from "./receipt.js";

const log = logger("activity");

/** What a receipt reads off the chain: only a transfer needs it, for who was on the other side. */
export interface ReceiptChain {
  readonly history: Pick<ChainHistory, "transaction">;
  /** The relayer, whose charge rides in a sponsored send and is not its recipient. */
  readonly relayer?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOAN_KINDS = ["borrow", "repay", "pledge", "unpledge"] as const;
type LoanKind = (typeof LOAN_KINDS)[number];
const isLoan = (kind: string): kind is LoanKind => (LOAN_KINDS as readonly string[]).includes(kind);
/** A pledge-and-borrow pledges first; that is the order the transaction does them in. */
const LEG_ORDER: Record<LoanKind, number> = { pledge: 0, borrow: 1, repay: 2, unpledge: 3 };

const num = (v: string | null) => (v === null ? null : D(v));

/**
 * One feed row and the receipt behind it, or null when the row is not this
 * account's — or is not a row at all.
 *
 * Read from the table the row points at, when somebody opens it, rather than
 * written onto the row: the feed is read constantly and never joined, and
 * almost no row is ever opened. A failure to read the extra is a receipt with
 * less on it, never an error in place of one.
 */
export async function readReceipt(
  db: Db,
  userId: string,
  id: string,
  wallet: string | null,
  chain: ReceiptChain,
): Promise<{ readonly row: ActivityRow; readonly detail: ReceiptDetail | null } | null> {
  if (!UUID.test(id)) return null;

  const [found] = await db
    .select({
      id: activities.id,
      kind: activities.kind,
      occurredAt: activities.occurredAt,
      title: activities.title,
      subtitle: activities.subtitle,
      amountUsd: activities.amountUsd,
      txSignature: activities.txSignature,
      mint: activities.mint,
      logoUrl: instruments.logoUrl,
      ticker: instruments.ticker,
      refTable: activities.refTable,
      refId: activities.refId,
      basketPortfolioId: activities.basketPortfolioId,
    })
    .from(activities)
    .leftJoin(tokens, eq(tokens.mint, activities.mint))
    .leftJoin(instruments, eq(instruments.id, tokens.instrumentId))
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .limit(1);
  if (found === undefined) return null;

  const { refTable, refId, basketPortfolioId, ticker, ...row } = found;

  const detail = await (async (): Promise<ReceiptDetail | null> => {
    if ((row.kind === "buy" || row.kind === "sell") && refTable === "order" && refId !== null) {
      return trade(db, userId, row.kind, refId, row.mint, ticker, row.amountUsd);
    }
    if (isLoan(row.kind) && row.txSignature !== null) {
      return loan(db, userId, row.txSignature);
    }
    if (refTable === "funding_intent" && refId !== null) {
      return deposit(db, userId, refId);
    }
    if (
      (row.kind === "transfer_in" || row.kind === "transfer_out") &&
      basketPortfolioId === null &&
      row.txSignature !== null &&
      row.mint !== null &&
      wallet !== null
    ) {
      return transfer(chain, row.txSignature, row.mint, wallet);
    }
    return null;
  })().catch((error: unknown) => {
    log.error({ userId, err: error }, "could not read a receipt's detail");
    return null;
  });

  return { row, detail };
}

async function trade(
  db: Db,
  userId: string,
  side: "buy" | "sell",
  orderId: string,
  mint: string | null,
  ticker: string | null,
  amountUsd: string | null,
): Promise<ReceiptDetail | null> {
  const [order] = await db
    .select({
      feeUsd: orders.feeUsd,
      mercuryFeeUsd: orders.mercuryFeeUsd,
      realisedPnlUsd: orders.realisedPnlUsd,
      decision: orders.decision,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (order === undefined) return null;

  const [lot] = await db
    .select({ shares: lots.shares, unitCostUsd: lots.unitCostUsd, referencePriceUsd: lots.referencePriceUsd })
    .from(lots)
    .where(and(eq(lots.orderId, orderId), eq(lots.userId, userId)))
    .limit(1);

  return tradeReceipt({
    side,
    ticker,
    mint,
    cashUsd: num(amountUsd),
    feeUsd: num(order.feeUsd),
    mercuryFeeUsd: num(order.mercuryFeeUsd),
    realisedPnlUsd: num(order.realisedPnlUsd),
    decision: order.decision,
    lot:
      lot === undefined
        ? null
        : {
            shares: D(lot.shares),
            unitCostUsd: D(lot.unitCostUsd),
            referencePriceUsd: num(lot.referencePriceUsd),
          },
  });
}

async function loan(db: Db, userId: string, signature: string): Promise<ReceiptDetail | null> {
  const legs = (
    await db
      .select()
      .from(loanEvents)
      .where(and(eq(loanEvents.userId, userId), eq(loanEvents.txSignature, signature)))
  )
    .filter((l): l is typeof l & { kind: LoanKind } => isLoan(l.kind))
    .sort((a, b) => LEG_ORDER[a.kind] - LEG_ORDER[b.kind]);
  const first = legs[0];
  if (first === undefined) return null;

  // The borrower's first lending transaction is the one that opened their Kamino account.
  const [opening] = await db
    .select({ txSignature: loanEvents.txSignature })
    .from(loanEvents)
    .where(eq(loanEvents.userId, userId))
    .orderBy(asc(loanEvents.occurredAt), asc(loanEvents.recordedAt))
    .limit(1);

  const earlier = await db
    .select({ kind: loanEvents.kind, usdAmount: loanEvents.usdAmount, debtAfterUsd: loanEvents.debtAfterUsd })
    .from(loanEvents)
    .where(and(eq(loanEvents.userId, userId), lt(loanEvents.occurredAt, first.occurredAt)))
    .orderBy(asc(loanEvents.occurredAt), asc(loanEvents.recordedAt));

  // Kamino takes only xStocks, so a pledged ticker is the backed token's.
  const tickers = [...new Set(legs.flatMap((l) => (l.ticker === null ? [] : [l.ticker])))];
  const decimals = new Map(
    tickers.length === 0
      ? []
      : (
          await db
            .select({ ticker: instruments.ticker, decimals: tokens.decimals })
            .from(tokens)
            .innerJoin(instruments, eq(instruments.id, tokens.instrumentId))
            .where(and(inArray(instruments.ticker, tickers), eq(tokens.issuer, "backed")))
        ).map((t) => [t.ticker, t.decimals]),
  );

  return loanReceipt({
    legs: legs.map((l) => ({
      kind: l.kind,
      usdAmount: num(l.usdAmount),
      ticker: l.ticker,
      tokensRaw: l.tokensRaw,
      decimals: l.ticker === null ? null : (decimals.get(l.ticker) ?? null),
    })),
    borrowApy: num(first.borrowApy),
    debtAfterUsd: D(first.debtAfterUsd),
    collateralAfterUsd: D(first.collateralAfterUsd),
    openedAccount: opening?.txSignature === signature,
    earlier: earlier.map((r) => ({
      kind: r.kind,
      usdAmount: num(r.usdAmount),
      debtAfterUsd: D(r.debtAfterUsd),
    })),
  });
}

async function deposit(db: Db, userId: string, intentId: string): Promise<ReceiptDetail | null> {
  const [intent] = await db
    .select({
      fromChain: fundingIntents.originChainName,
      fromToken: fundingIntents.originCurrencySymbol,
      mercuryFeeUsd: fundingIntents.mercuryFeeUsd,
      sourceTx: fundingIntents.inTxHash,
    })
    .from(fundingIntents)
    .where(and(eq(fundingIntents.id, intentId), eq(fundingIntents.userId, userId)))
    .limit(1);
  if (intent === undefined) return null;
  const fee = num(intent.mercuryFeeUsd);
  return {
    type: "deposit",
    fromChain: intent.fromChain,
    fromToken: intent.fromToken,
    mercuryFeeUsd: fee === null ? null : fee.toDecimalPlaces(6).toFixed(),
    sourceTx: intent.sourceTx,
  };
}

async function transfer(
  chain: ReceiptChain,
  signature: string,
  mint: string,
  wallet: string,
): Promise<ReceiptDetail | null> {
  const tx = await chain.history.transaction(signature);
  if (tx === null) return null;
  const parties = transferParties(tx, {
    wallet,
    mint,
    ...(chain.relayer === undefined ? {} : { relayer: chain.relayer }),
  });
  return {
    type: "transfer",
    counterparty: parties.counterparty,
    accountSetupUsd: parties.accountSetupUsd === null ? null : parties.accountSetupUsd.toFixed(),
  };
}
