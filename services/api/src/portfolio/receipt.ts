import { Decimal, ZERO, toWire } from "@mercury/core";
import { Decision } from "@mercury/types";
import { tokenText } from "../lending/events.js";
import { outstandingPrincipal, type LedgerRow } from "../lending/interest.js";

/**
 * What one activity row is made of, read from the record behind it.
 *
 * The feed stays thin on purpose (docs/05): a title, a line under it, an
 * amount. Everything that explains the amount — the fee in it, the price the
 * shares went at, the loan it left behind — already sits in the table the row
 * points at, and a receipt is that table read back, one row at a time, when
 * somebody asks. Nothing here is estimated: a figure the record does not hold
 * is null, and the screen leaves its line out.
 *
 * Decimals cross as strings, like every other figure on the wire.
 */
export type ReceiptDetail = TradeReceipt | LoanReceipt | DepositReceipt | TransferReceipt;

export interface TradeReceipt {
  readonly type: "trade";
  readonly side: "buy" | "sell";
  /** The stock, for a link back to it. Null when the mint is not one we list. */
  readonly ticker: string | null;
  readonly shares: string | null;
  readonly pricePerShare: string | null;
  /** The real share's price when it traded: what `pricePerShare` is above or below. */
  readonly referencePricePerShare: string | null;
  /** What the shares themselves cost or fetched. The fees are on top of a buy and come off a sell. */
  readonly sharesUsd: string | null;
  readonly mercuryFeeUsd: string | null;
  readonly networkFeeUsd: string | null;
  readonly realisedPnlUsd: string | null;
  /** Who issued the token that traded. */
  readonly issuer: "backed" | "ondo" | null;
  /** The venues the quote routed through, in order. */
  readonly route: readonly string[];
}

export interface LoanLeg {
  readonly kind: "borrow" | "repay" | "pledge" | "unpledge";
  readonly usdAmount: string | null;
  readonly ticker: string | null;
  /** Collateral moved, as a person would write it: "0.02239976". */
  readonly tokens: string | null;
}

export interface LoanReceipt {
  readonly type: "loan";
  /** Everything the transaction did, in order: a pledge and a borrow can share one. */
  readonly legs: readonly LoanLeg[];
  /** Kamino's rate when it landed. It moves with demand; this is what it was. */
  readonly borrowApy: string | null;
  readonly debtAfterUsd: string;
  readonly collateralAfterUsd: string;
  /** The transaction opened the borrower's Kamino account, and Mercury paid its rent. */
  readonly openedAccount: boolean;
  /** What closing the loan paid in interest. Null unless this closed it and the amount is known. */
  readonly interestPaidUsd: string | null;
}

export interface DepositReceipt {
  readonly type: "deposit";
  /** "Base", as the chain was named to the user when they deposited. */
  readonly fromChain: string;
  readonly fromToken: string;
  readonly mercuryFeeUsd: string | null;
  /** The deposit's hash on the chain it came from, which Relay's explorer finds it by. */
  readonly sourceTx: string | null;
}

export interface TransferReceipt {
  readonly type: "transfer";
  /** The other wallet, when the transaction makes it plain which one it was. */
  readonly counterparty: string | null;
  /** What a send paid to open the recipient's USDC account. */
  readonly accountSetupUsd: string | null;
}

/** Six places is a micro-dollar, the smallest amount of USDC there is. */
const micro = (v: Decimal): string => toWire(v.toDecimalPlaces(6));

export interface TradeSource {
  readonly side: "buy" | "sell";
  readonly ticker: string | null;
  /** The token that traded: the feed row's mint. */
  readonly mint: string | null;
  /** What crossed the wallet's edge, which is the feed row's amount. */
  readonly cashUsd: Decimal | null;
  /** Everything the relayer took, network and Mercury together. */
  readonly feeUsd: Decimal | null;
  readonly mercuryFeeUsd: Decimal | null;
  readonly realisedPnlUsd: Decimal | null;
  /** The order's stored decision, as the wire carries it: the quote it executed. */
  readonly decision: unknown;
  /** The lot a buy wrote. A sell writes none. */
  readonly lot: {
    readonly shares: Decimal;
    readonly unitCostUsd: Decimal;
    readonly referencePriceUsd: Decimal | null;
  } | null;
}

/**
 * A filled order, as the receipt shows it.
 *
 * A buy's shares and price come from its lot, which was read off the chain at
 * settlement. A sell writes no lot, but it sells an exact number of tokens, so
 * the quote's share count is what left the wallet, and the price is what those
 * shares fetched over that count. The feed row's amount is the cash, so the
 * shares' own value is that amount less the charge on a buy and plus it on a
 * sell — the charge rides in the same transaction either way.
 */
export const tradeReceipt = (s: TradeSource): TradeReceipt => {
  const parsed = Decision.safeParse(s.decision);
  const d = parsed.success ? parsed.data : null;
  const traded =
    d === null
      ? null
      : (d.candidates.find((c) => c.mint === s.mint) ?? (d.kind === "refuse" ? null : d.best));

  const cash = s.cashUsd?.abs() ?? null;
  const charge = s.feeUsd;
  // Before Mercury had a fee, the whole charge was the network's.
  const mercury = charge === null ? null : (s.mercuryFeeUsd ?? ZERO);
  const network = charge === null || mercury === null ? null : Decimal.max(ZERO, charge.sub(mercury));
  const sharesUsd =
    cash === null ? null : s.side === "buy" ? cash.sub(charge ?? ZERO) : cash.add(charge ?? ZERO);

  const shares = s.lot?.shares ?? (traded?.filledShares == null ? null : new Decimal(traded.filledShares));
  const price =
    s.lot?.unitCostUsd ??
    (sharesUsd === null || shares === null || shares.lte(0) ? null : sharesUsd.div(shares));
  const reference = s.lot?.referencePriceUsd ?? (d === null ? null : new Decimal(d.fairPricePerShare));

  return {
    type: "trade",
    side: s.side,
    ticker: s.ticker,
    shares: shares === null ? null : toWire(shares),
    pricePerShare: price === null ? null : micro(price),
    referencePricePerShare: reference === null ? null : micro(reference),
    sharesUsd: sharesUsd === null ? null : micro(sharesUsd),
    mercuryFeeUsd: mercury === null ? null : micro(mercury),
    networkFeeUsd: network === null ? null : micro(network),
    realisedPnlUsd: s.realisedPnlUsd === null ? null : micro(s.realisedPnlUsd),
    issuer: traded?.issuer ?? null,
    route: traded?.routeLabels ?? [],
  };
};

export interface LoanSource {
  /** This transaction's `loan_event` rows, in the order they were planned. */
  readonly legs: readonly {
    readonly kind: LoanLeg["kind"];
    readonly usdAmount: Decimal | null;
    readonly ticker: string | null;
    readonly tokensRaw: string | null;
    /** The collateral token's decimals. Null when the ticker is not one we list. */
    readonly decimals: number | null;
  }[];
  readonly borrowApy: Decimal | null;
  readonly debtAfterUsd: Decimal;
  readonly collateralAfterUsd: Decimal;
  readonly openedAccount: boolean;
  /** The borrower's ledger before this transaction, oldest first. */
  readonly earlier: readonly LedgerRow[];
}

/**
 * A lending transaction, as the receipt shows it.
 *
 * The interest is paid when the loan is closed, because that is how the ledger
 * counts it: a repay comes off what was borrowed first, so a partial one pays
 * no interest and leaves it all on the loan. A repay that closes the loan pays
 * whatever is left over that, which is its amount less what was outstanding.
 */
export const loanReceipt = (s: LoanSource): LoanReceipt => {
  const closing = s.debtAfterUsd.lte(0)
    ? s.legs.find((l) => l.kind === "repay" && l.usdAmount !== null)
    : undefined;
  const principal = closing === undefined ? null : outstandingPrincipal(s.earlier);
  const interest =
    closing?.usdAmount == null || principal === null
      ? null
      : Decimal.max(ZERO, closing.usdAmount.sub(principal));

  return {
    type: "loan",
    legs: s.legs.map((l) => ({
      kind: l.kind,
      usdAmount: l.usdAmount === null ? null : toWire(l.usdAmount),
      ticker: l.ticker,
      tokens: l.tokensRaw === null || l.decimals === null ? null : tokenText(l.tokensRaw, l.decimals),
    })),
    borrowApy: s.borrowApy === null ? null : toWire(s.borrowApy),
    debtAfterUsd: micro(s.debtAfterUsd),
    collateralAfterUsd: micro(s.collateralAfterUsd),
    openedAccount: s.openedAccount,
    interestPaidUsd: interest === null ? null : micro(interest),
  };
};
