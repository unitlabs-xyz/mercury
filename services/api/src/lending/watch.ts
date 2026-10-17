import type { Health, BorrowSummary } from "./capacity.js";

/** What to tell somebody, in the words they will read on a phone. */
export interface Alert {
  readonly health: Health;
  readonly subject: string;
  readonly body: string;
  /**
   * For the feed, where there is no room for the body: a label, as every row's
   * title is. The mail is written to somebody and says "your"; the feed does not.
   */
  readonly title: string;
}

/** Worst last. A move up this list is worth interrupting somebody for. */
const SEVERITY: readonly Health[] = ["healthy", "over_limit", "margin_call", "liquidation"];

const rank = (h: Health): number => SEVERITY.indexOf(h);

const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const percent = (n: number): string => `${Math.round(n * 100)}%`;

/**
 * Whether this loan's owner needs to hear from us, and what about.
 *
 * Only a move to a worse state qualifies. A loan does not cross a line and then
 * sit there for a minute — it sits there for hours, and a five-minute job that
 * spoke every time would send the same sentence a hundred times before lunch.
 * Somebody warned constantly stops reading, and the one message that mattered
 * arrives in a thread they have learned to ignore.
 *
 * Recovery is silent on purpose. "Your loan is healthy again" is pleasant and
 * it is not urgent, and every message that is not urgent makes the urgent ones
 * cheaper to ignore. What recovery does is reset the mark, so that falling back
 * into trouble is worth saying again.
 */
export const alertFor = (
  told: Health | null,
  summary: Pick<
    BorrowSummary,
    "health" | "debtUsd" | "repayToClearMarginCallUsd" | "overTargetUsd" | "safeUntilDrop"
  >,
): Alert | null => {
  const now = summary.health;
  if (now === "healthy") return null;
  // Nothing new to say: they already know about this, or worse.
  if (told !== null && rank(now) <= rank(told)) return null;

  const owed = money(Number(summary.debtUsd));
  const cushion = summary.safeUntilDrop === null ? null : percent(Number(summary.safeUntilDrop));

  switch (now) {
    case "liquidation":
      return {
        health: now,
        title: "Liquidation in progress",
        subject: "Your collateral is being sold",
        body:
          `Your loan of ${owed} has reached the point where Kamino sells the stock behind it, ` +
          `and that is happening now. Repaying stops it. Nothing else will.`,
      };
    case "margin_call":
      return {
        health: now,
        title: "Liquidation risk",
        subject: "Repay now, or your shares will be sold",
        body:
          `Your stocks have fallen far enough that your loan of ${owed} is close to the point ` +
          `where Kamino sells them. Repaying ${money(Number(summary.repayToClearMarginCallUsd))} ` +
          `clears it. ` +
          (cushion === null
            ? "There is very little room left."
            : `A further fall of about ${cushion} would start the sale.`),
      };
    case "over_limit":
      return {
        health: now,
        title: "Loan over limit",
        subject: "Your loan is past its safe limit",
        body:
          `Your stocks have fallen and your loan of ${owed} is now past the limit we lend to. ` +
          `Nothing is being sold — Kamino's own line is further out — but borrowing more and ` +
          `withdrawing stock are paused until you repay ` +
          `${money(Number(summary.overTargetUsd))} or pledge more.`,
      };
  }
};

/**
 * The mark to store after a pass.
 *
 * A loan back inside the limit clears it, so that falling out again is worth
 * saying. A loan we could not reach its owner about keeps the old mark, so the
 * next pass tries again rather than counting silence as having told them.
 */
export const markAfter = (told: Health | null, current: Health, delivered: boolean): Health | null =>
  current === "healthy" ? "healthy" : delivered ? current : told;
