import type { Decimal } from "@mercury/core";
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

const money = (d: Decimal): string => `$${d.toFixed(2)}`;

/**
 * What a lending action did, as events.
 *
 * One transaction can be two events: `deposit_and_borrow` pledges and borrows
 * at once, and a feed that reported only the cash would lose the pledge while a
 * feed that reported only the pledge would lose the loan.
 *
 * **"all" carries no figure.** A repay of everything and a withdrawal of
 * everything are sized by the chain at the moment they land, not by the request,
 * and the difference is the interest that accrued in between. Rather than put a
 * number in the feed that is nearly right, these say what happened and leave the
 * amount out; `debt_after_usd` on consecutive rows recovers it exactly, later,
 * for anyone who needs it.
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
    title: `Pledged ${tokenText(tokensRaw, decimalsOf(ticker))} ${ticker}`,
    subtitle: "Held by Kamino as collateral",
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
          title: `Borrowed ${money(intent.usd)} against ${intent.ticker}`,
          subtitle: null,
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
          title: `Borrowed ${money(intent.usd)}`,
          subtitle: "Against your pledged stock",
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
              title: "Repaid your loan in full",
              subtitle: null,
            }
          : {
              kind: "repay",
              usdAmount: intent.usd,
              ticker: null,
              tokensRaw: null,
              title: `Repaid ${money(intent.usd)}`,
              subtitle: null,
            },
      ];

    case "withdraw":
      return [
        {
          kind: "unpledge",
          usdAmount: null,
          ticker: intent.ticker,
          tokensRaw: intent.tokensRaw === "all" ? null : intent.tokensRaw,
          title:
            intent.tokensRaw === "all"
              ? `Withdrew all your ${intent.ticker}`
              : `Withdrew ${tokenText(intent.tokensRaw, decimalsOf(intent.ticker))} ${intent.ticker}`,
          subtitle: "Back in your wallet",
        },
      ];
  }
};
