import { D, type Decimal } from "@mercury/core";
import type { TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import type { LendingIntent } from "./ports.js";

/** One thing a lending transaction did, ready for `loan_event` and the feed. */
export interface PlannedLoanEvent {
  readonly kind: "borrow" | "repay" | "pledge" | "unpledge";
  /** Dollars borrowed or repaid. Null on a collateral move, and on "all". */
  readonly usdAmount: Decimal | null;
  readonly ticker: string | null;
  readonly tokensRaw: string | null;
  readonly title: string;
  readonly subtitle: string | null;
}

/** "2.4" from 240000000 at 8 decimals, without trailing zeros a person would not write. */
export const tokenText = (raw: string, decimals: number): string => {
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
};

/**
 * What a lending action did, as events.
 *
 * Worded as the rest of the feed is: a past-tense verb and what it acted on
 * for the title, the one detail that tells two rows apart for the line under
 * it. Never the amount, which the row's own column already shows, and never
 * "your" — the whole feed is the borrower's. "Collateral" rather than Kamino's
 * "pledge", which is the word the borrow sheet uses too.
 *
 * One transaction can be two events: `deposit_and_borrow` pledges and borrows
 * at once, and a feed that reported only the cash would lose the pledge while a
 * feed that reported only the pledge would lose the loan.
 *
 * **"all" carries no figure here.** A repay of everything and a withdrawal of
 * everything are sized by the chain at the moment they land, not by the request,
 * and the difference is the interest that accrued in between. Rather than put a
 * number in the feed that is nearly right, these leave the amount out, and
 * `landedAmounts` fills it in from the transaction once it has landed.
 */
export const planLoanEvents = (
  intent: LendingIntent,
  decimalsOf: (ticker: string) => number,
): readonly PlannedLoanEvent[] => {
  const pledge = (ticker: string, tokensRaw: string): PlannedLoanEvent => ({
    kind: "pledge",
    usdAmount: null,
    ticker,
    tokensRaw,
    title: "Added collateral",
    subtitle: `${tokenText(tokensRaw, decimalsOf(ticker))} ${ticker}`,
  });

  switch (intent.kind) {
    case "deposit":
      return [pledge(intent.ticker, intent.tokensRaw)];

    case "deposit_and_borrow":
      return [
        pledge(intent.ticker, intent.tokensRaw),
        {
          kind: "borrow",
          usdAmount: intent.usd,
          ticker: intent.ticker,
          tokensRaw: null,
          title: "Borrowed USDC",
          subtitle: `Against ${intent.ticker}`,
        },
      ];

    case "borrow":
      // No single ticker: this draws against everything already pledged, and
      // naming one of them would say something untrue about the other.
      return [
        {
          kind: "borrow",
          usdAmount: intent.usd,
          ticker: null,
          tokensRaw: null,
          title: "Borrowed USDC",
          subtitle: "Against collateral",
        },
      ];

    case "repay":
      return [
        intent.usd === "all"
          ? {
              kind: "repay",
              usdAmount: null,
              ticker: null,
              tokensRaw: null,
              title: "Repaid loan",
              subtitle: "Paid in full",
            }
          : {
              kind: "repay",
              usdAmount: intent.usd,
              ticker: null,
              tokensRaw: null,
              title: "Repaid loan",
              subtitle: "Partial repayment",
            },
      ];

    case "withdraw":
      return [
        {
          kind: "unpledge",
          usdAmount: null,
          ticker: intent.ticker,
          tokensRaw: intent.tokensRaw === "all" ? null : intent.tokensRaw,
          title: "Withdrew collateral",
          subtitle:
            intent.tokensRaw === "all"
              ? `All ${intent.ticker}`
              : `${tokenText(intent.tokensRaw, decimalsOf(intent.ticker))} ${intent.ticker}`,
        },
      ];
  }
};

const sumOwned = (entries: readonly TokenBalanceEntry[], owner: string, mint: string): bigint =>
  entries.reduce((total, e) => (e.owner === owner && e.mint === mint ? total + e.rawAmount : total), 0n);

/**
 * The figures "all" could not name, read off the transaction that landed.
 *
 * A repay of everything sends exactly what was owed at its slot, so the USDC
 * that left the wallet is the repayment, interest included; a withdrawal of
 * everything returns the whole of the collateral to it. Without this the feed
 * printed a repay in full with no amount beside it, and the receipt had no way
 * to say how much of it was interest; a withdrawal of everything said "All
 * NVDA" where it can say how much.
 *
 * Only the gaps are filled. An amount the request named is what Kamino was
 * asked for and stays the figure; a transaction that shows nothing moved
 * leaves the gap a gap rather than writing a zero.
 */
export const landedAmounts = (
  planned: readonly PlannedLoanEvent[],
  tx: TransactionDetail,
  ctx: {
    readonly wallet: string;
    readonly usdcMint: string;
    readonly mintOf: (ticker: string) => string | null;
  },
): readonly PlannedLoanEvent[] => {
  const change = (mint: string) =>
    sumOwned(tx.postTokens, ctx.wallet, mint) - sumOwned(tx.preTokens, ctx.wallet, mint);
  const decimalsOf = (mint: string) =>
    [...tx.preTokens, ...tx.postTokens].find((e) => e.mint === mint)?.decimals ?? 6;

  return planned.map((event) => {
    if (event.kind === "repay" && event.usdAmount === null) {
      const sent = -change(ctx.usdcMint);
      return sent > 0n
        ? { ...event, usdAmount: D(sent.toString()).div(D(10).pow(decimalsOf(ctx.usdcMint))) }
        : event;
    }
    if (event.kind === "unpledge" && event.tokensRaw === null && event.ticker !== null) {
      const mint = ctx.mintOf(event.ticker);
      const returned = mint === null ? 0n : change(mint);
      if (mint === null || returned <= 0n) return event;
      return {
        ...event,
        tokensRaw: returned.toString(),
        subtitle: `${tokenText(returned.toString(), decimalsOf(mint))} ${event.ticker}`,
      };
    }
    return event;
  });
};
