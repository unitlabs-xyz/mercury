import type { PortfolioSummary } from "@mercury/types";
import { usd } from "@mercury/view";
import type { Borrow, Health } from "../api/borrow";

/** A fall this small to a margin call is worth saying before it happens. */
export const EARLY_WARNING = 0.1;

/** The road a loan goes down as prices fall, in order. */
export const STAGES: readonly Health[] = ["healthy", "over_limit", "margin_call", "liquidation"];

export const STAGE_LABEL: Record<Health, string> = {
  healthy: "Healthy",
  over_limit: "Over limit",
  margin_call: "Margin call",
  liquidation: "Kamino sells",
};

export const pctOf = (x: number) => `${Math.max(0, Math.round(x * 100))}%`;

/** What reaching a stage means, said after "a 9% fall until". */
const REACHING: Record<Health, string> = {
  healthy: "it is healthy",
  over_limit: "it passes the limit",
  margin_call: "a margin call",
  liquidation: "Kamino sells",
};

/** The gap to the next stage, as the road labels it: "9% fall until Kamino sells". */
export const fallUntil = (next: NonNullable<Alarm["next"]>): string =>
  `${pctOf(next.drop)} fall until ${REACHING[next.stage]}`;

export interface Alarm {
  readonly tone: "warn" | "down";
  /** Where the loan is on the road. */
  readonly stage: Health;
  readonly title: string;
  readonly body: string;
  /** The next stage down, and the fall that would take the loan there. Null when there is none to show. */
  readonly next: { readonly stage: Health; readonly drop: number } | null;
  /** What repaying takes, for the button. Null where there is no figure to put on it. */
  readonly repayUsd: number | null;
}

/** "your loan", or "Phantom's loan" for a linked wallet's. */
const whose = (owner: string | null) => (owner === null ? "your loan" : `${owner}'s loan`);
const Whose = (owner: string | null) => (owner === null ? "Your loan" : `${owner}'s loan`);

/**
 * What to say about the chosen wallet's loan, from most to least urgent; null
 * when there is nothing to say. `owner` names a linked wallet; the Mercury
 * wallet's loan is "your loan".
 */
export const alarmFor = (b: Borrow, owner: string | null = null): Alarm | null => {
  switch (b.health) {
    case "liquidation":
      return {
        tone: "down",
        stage: "liquidation",
        title: `Kamino is selling collateral on ${whose(owner)}`,
        body: `It has reached Kamino's liquidation line. Repay ${usd(b.repayToClearMarginCallUsd)} now to stop further sales.`,
        next: null,
        repayUsd: b.repayToClearMarginCallUsd > 0 ? b.repayToClearMarginCallUsd : null,
      };
    case "margin_call":
      return {
        tone: "down",
        stage: "margin_call",
        title: `Margin call on ${whose(owner)}`,
        // One amount often does both; saying it twice reads as two different bills.
        body:
          b.overTargetUsd <= b.repayToClearMarginCallUsd
            ? `Repay ${usd(b.repayToClearMarginCallUsd)} to keep your shares from being sold and unlock borrowing and withdrawals.`
            : `Repay ${usd(b.repayToClearMarginCallUsd)} to keep your shares from being sold. Repaying ${usd(
                b.overTargetUsd,
              )} also unlocks borrowing and withdrawals.`,
        next: b.safeUntilDrop === null ? null : { stage: "liquidation", drop: b.safeUntilDrop },
        repayUsd: b.repayToClearMarginCallUsd > 0 ? b.repayToClearMarginCallUsd : null,
      };
    case "over_limit":
      return {
        tone: "warn",
        stage: "over_limit",
        title: `${Whose(owner)} is past the 80% limit`,
        body: `Prices fell, so borrowing more and withdrawing shares are paused. Repay ${usd(
          b.overTargetUsd,
        )} or add collateral to unlock them.`,
        next: b.dropToMarginCall === null ? null : { stage: "margin_call", drop: b.dropToMarginCall },
        repayUsd: b.overTargetUsd > 0 ? b.overTargetUsd : null,
      };
    case "healthy":
      return b.debtUsd > 0 && b.dropToMarginCall !== null && b.dropToMarginCall < EARLY_WARNING
        ? {
            tone: "warn",
            stage: "healthy",
            title: `${Whose(owner)} is close to a margin call`,
            body: "A small fall would start one and pause withdrawals. Repaying a little now keeps your shares well clear.",
            next: { stage: "margin_call", drop: b.dropToMarginCall },
            repayUsd: null,
          }
        : null;
  }
};

export interface OtherAlarm {
  readonly id: string;
  readonly name: string;
  readonly isPrimary: boolean;
  readonly health: Exclude<Health, "healthy">;
}

const SEVERITY: Record<Health, number> = { healthy: 0, over_limit: 1, margin_call: 2, liquidation: 3 };

/**
 * Loans in trouble in wallets other than the one being shown, worst first.
 * Their detail is each wallet's own to read; this only says which, so a margin
 * call in one wallet is not missed while looking at another, or at all of
 * them. `shown` is the chosen wallet's id, or null for every wallet at once.
 */
export const otherAlarms = (
  wallets: PortfolioSummary["wallets"],
  shown: string | null,
  name: (w: PortfolioSummary["wallets"][number]) => string,
): readonly OtherAlarm[] =>
  wallets
    .filter((w) => w.id !== shown && w.loanHealth !== null && w.loanHealth !== "healthy")
    .map((w) => ({
      id: w.id,
      name: name(w),
      isPrimary: w.isPrimary,
      health: w.loanHealth as OtherAlarm["health"],
    }))
    .sort((a, b) => SEVERITY[b.health] - SEVERITY[a.health]);

/** One line for another wallet's loan. */
export const otherAlarmLine = (a: OtherAlarm): string => {
  const loan = a.isPrimary ? "Your Mercury wallet's loan" : `${a.name}'s loan`;
  return a.health === "liquidation"
    ? `${loan} is being liquidated`
    : a.health === "margin_call"
      ? `${loan} is in a margin call`
      : `${loan} is past the 80% limit`;
};
