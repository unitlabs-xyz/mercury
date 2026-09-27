import { Link } from "react-router-dom";
import { useBorrow, type Borrow } from "../api/borrow";
import { Alert } from "../ui/icons";
import { usd } from "./format";

/** A fall this small to a margin call is worth saying before it happens. */
const EARLY_WARNING = 0.1;

const pctOf = (x: number | null) => (x === null ? "" : `${Math.max(0, Math.round(x * 100))}%`);

type Alarm = { tone: "warn" | "down"; title: string; body: string; cta: string };

/** What to say, from most to least urgent. Null when there is nothing to say. */
export const alarmFor = (b: Borrow): Alarm | null => {
  const room = b.safeUntilDrop;
  switch (b.health) {
    case "liquidation":
      return {
        tone: "down",
        title: "Kamino is selling your collateral",
        body: `Your loan has reached Kamino's liquidation line. Repay ${usd(b.repayToClearMarginCallUsd)} now to stop further sales.`,
        cta: "Repay now",
      };
    case "margin_call":
      return {
        tone: "down",
        title: "Margin call: repay to protect your shares",
        body: `A ${pctOf(room)} fall from here and Kamino starts selling your shares. Repay at least ${usd(
          b.repayToClearMarginCallUsd,
        )} now; ${usd(b.overTargetUsd)} unlocks borrowing and withdrawals again.`,
        cta: "Repay now",
      };
    case "over_limit":
      return {
        tone: "warn",
        title: "Your loan is past the 80% limit",
        body: `Prices fell, so borrowing more and withdrawing shares are paused. Repay ${usd(
          b.overTargetUsd,
        )} or pledge more stock to unlock them. A margin call starts ${pctOf(b.dropToMarginCall)} lower.`,
        cta: "Repay",
      };
    case "healthy":
      return b.debtUsd > 0 && b.dropToMarginCall !== null && b.dropToMarginCall < EARLY_WARNING
        ? {
            tone: "warn",
            title: "Your loan is close to a margin call",
            body: `A ${pctOf(b.dropToMarginCall)} fall would start one and pause withdrawals. Repaying a little now keeps your shares well clear.`,
            cta: "Repay",
          }
        : null;
  }
};

/**
 * The loan's alarm, on every screen while it matters. A margin call should not
 * wait for someone to open the right page; it should be the first thing they
 * see anywhere in the app.
 */
export const LoanAlert = () => {
  const borrow = useBorrow();
  const alarm = borrow.data ? alarmFor(borrow.data) : null;
  if (!alarm) return null;
  const down = alarm.tone === "down";
  return (
    <div
      role={down ? "alert" : "status"}
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
        down ? "border-down-line bg-down-tint text-down-deep" : "border-warn-line bg-warn-tint text-warn"
      }`}
    >
      <Alert className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{alarm.title}</p>
        <p className="mt-0.5 text-[12px] leading-[1.45] opacity-90">{alarm.body}</p>
      </div>
      <Link
        to="?borrow=repay"
        className={`shrink-0 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white transition-colors ${
          down ? "bg-down hover:bg-down-deep" : "bg-warn hover:opacity-90"
        }`}
      >
        {alarm.cta}
      </Link>
    </div>
  );
};
