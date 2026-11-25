import { stackedReturn, toWire, ZERO, type Decimal } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import type { PortfolioSummary } from "@mercury/types";
import { interestPaid, loanParts, outstandingPrincipal, type LedgerRow } from "../lending/interest.js";
import type { HoldingRow } from "../routes/portfolio.js";
import type { ActingWallet } from "../wallets/acting.js";
import { marketPricePerShare, priceFor } from "./value.js";

const HEALTHS = ["healthy", "over_limit", "margin_call", "liquidation"] as const;
type Health = (typeof HEALTHS)[number];

/** Everything the database holds about one wallet that the summary reads. None of it is read off the chain. */
export interface WalletRecords {
  /** The wallet's newest hourly reading. Null before its first, minutes after linking. */
  readonly latest: {
    readonly totalUsd: Decimal;
    readonly debtUsd: Decimal;
    /** Null on a reading from before Earn was recorded. */
    readonly earnUsd: Decimal | null;
    /** When its balances were read. */
    readonly asOf: Date;
  } | null;
  readonly holdings: readonly HoldingRow[];
  /** Profit and loss on every sell recorded for the wallet. */
  readonly realisedUsd: Decimal;
  /** Dividends paid as shares, at the price they were worth when they arrived. */
  readonly dividendsUsd: Decimal;
  /** Put into Earn less taken out. Null when nothing is recorded, which is no basis to measure from. */
  readonly earnNetDepositedUsd: Decimal | null;
  /** Some of that was Earn shares sent in or out, valued at a day's share price: earned is `~`. */
  readonly earnEstimated?: boolean;
  /** Its loan's events, oldest first. */
  readonly loanLedger: readonly LedgerRow[];
  /** What the loan watch last recorded about its loan. */
  readonly loanHealth: string | null;
  /** True once the history reader has read its past. The Mercury wallet's past is Mercury's own records. */
  readonly historyRead: boolean;
}

const asHealth = (h: string | null): Health =>
  (HEALTHS as readonly string[]).includes(h ?? "") ? (h as Health) : "healthy";

const sum = <T>(items: readonly T[], pick: (t: T) => Decimal) => items.reduce((s, t) => s.add(pick(t)), ZERO);

/**
 * The summary at the top of Home, from records and the price board alone.
 *
 * Net worth is the wallets' latest hourly readings, already net of debt, so a
 * large loan never inflates it. P&L, income and loan interest count only the
 * wallets whose past has been read: a linked wallet still being read would
 * otherwise show its whole value as profit, or a loan's whole debt as
 * interest. It is counted as calculating instead, and the screen says so.
 */
export function summarise(
  wallets: readonly { readonly wallet: ActingWallet; readonly records: WalletRecords }[],
  board: ReadonlyMap<string, TokenPrice>,
): PortfolioSummary {
  const ready = wallets.filter((w) => w.wallet.isPrimary || w.records.historyRead);
  const readings = wallets.flatMap((w) => (w.records.latest === null ? [] : [w.records.latest]));

  let unrealised = ZERO;
  let openCost = ZERO;
  let estimatedCost = ZERO;
  for (const row of ready.flatMap((w) => w.records.holdings)) {
    if (row.shares.lte(ZERO)) continue;
    const priced = priceFor(row, board);
    const stacked = stackedReturn(
      {
        sharesWithBasis: row.sharesWithBasis,
        costBasisUsd: row.costBasisUsd,
        referenceBasisUsd: row.referenceBasisUsd,
        feeUsd: row.feeUsd,
      },
      {
        marketPerShare: priced === undefined ? ZERO : marketPricePerShare(priced),
        referencePerShare: priced?.pricePerShare ?? null,
      },
    );
    unrealised = unrealised.add(stacked.totalPnlUsd);
    openCost = openCost.add(row.costBasisUsd);
    estimatedCost = estimatedCost.add(row.estimatedCostUsd);
  }
  const realised = sum(ready, (w) => w.records.realisedUsd);

  /*
   * Earned in Earn: the balance at the last reading, less what went in net of
   * what came out. With nothing recorded there is no basis, and it is nothing
   * earned rather than the whole balance, as /v1/earn has it.
   */
  const earn = sum(ready, ({ records: r }) => {
    if (r.earnNetDepositedUsd === null || r.latest?.earnUsd == null) return ZERO;
    const earned = r.latest.earnUsd.sub(r.earnNetDepositedUsd);
    return earned.gt(ZERO) ? earned : ZERO;
  });
  const dividends = sum(ready, (w) => w.records.dividendsUsd);

  // Owed beyond what was borrowed. A ledger that cannot explain the debt adds nothing, rather than calling all of it interest.
  const interest = sum(ready, ({ records: r }) => {
    const owed = r.latest?.debtUsd ?? ZERO;
    if (owed.lte(ZERO)) return ZERO;
    /*
     * What was owed is the hourly reading's; what was borrowed has to be as of
     * the same moment. A repay or a liquidation recorded since took the
     * principal down at once while the debt waited for the next reading, and
     * the gap read as interest: a $500 liquidation showed $550 of it for up to
     * an hour.
     */
    const asOf = r.latest!.asOf.getTime();
    const then = r.loanLedger.filter((row) => row.at === undefined || row.at.getTime() <= asOf);
    return loanParts(owed, outstandingPrincipal(then)).interest ?? ZERO;
  });

  const oldest = readings.reduce<Date | null>((o, r) => (o === null || r.asOf < o ? r.asOf : o), null);

  return {
    wallets: wallets.map(({ wallet, records: r }) => {
      const debt = r.latest?.debtUsd ?? ZERO;
      return {
        id: wallet.id,
        address: wallet.address,
        isPrimary: wallet.isPrimary,
        label: wallet.label,
        valueUsd: r.latest === null ? null : toWire(r.latest.totalUsd),
        asOf: r.latest?.asOf.toISOString() ?? null,
        debtUsd: toWire(debt),
        loanHealth: debt.gt(ZERO) ? asHealth(r.loanHealth) : null,
        history: wallet.isPrimary || r.historyRead ? "ready" : "calculating",
      };
    }),
    netWorthUsd: toWire(sum(readings, (r) => r.totalUsd)),
    asOf: oldest?.toISOString() ?? null,
    pnl: {
      totalUsd: toWire(unrealised.add(realised)),
      unrealisedUsd: toWire(unrealised),
      realisedUsd: toWire(realised),
      returnPct: openCost.isZero() ? null : toWire(unrealised.div(openCost).mul(100)),
      estimatedCostUsd: toWire(estimatedCost),
    },
    income: {
      totalUsd: toWire(earn.add(dividends)),
      earnUsd: toWire(earn),
      dividendsUsd: toWire(dividends),
      earnEstimated: ready.some((w) => w.records.earnEstimated === true),
    },
    loanInterestUsd: toWire(interest),
    // Paid already: what repayments took beyond what was borrowed, every ready wallet's loans.
    loanInterestPaidUsd: toWire(sum(ready, ({ records: r }) => interestPaid(r.loanLedger))),
    calculating: wallets.length - ready.length,
  };
}
