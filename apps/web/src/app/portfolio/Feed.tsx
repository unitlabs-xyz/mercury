import type { ReactNode } from "react";
import type { Upcoming as UpcomingItem } from "../../api/dashboard";
import { Card, Clock, Plus, Refresh, Trend } from "../../ui/icons";
import type { Event } from "@mercury/view";
import { RailCard, RailHead, StatusChip } from "../../ui/ds";
import { usd } from "@mercury/view";
import { ActivityMark } from "../activity-mark";
import { UPCOMING_ICON } from "./icons";
import { Skeleton, relDay, shortDate } from "./ui";

const UPCOMING_LOOK: Record<UpcomingItem["kind"], { icon: ReactNode; tone: string }> = {
  queued: { icon: <Clock />, tone: "bg-warn-tint text-warn" },
  card: { icon: <Card />, tone: "bg-chip text-ink-soft" },
  interest: { icon: <Plus />, tone: "bg-up-tint text-up-deep" },
  dividend: { icon: <Refresh />, tone: "bg-up-tint text-up-deep" },
  loan: { icon: <Trend />, tone: "bg-chip text-ink-soft" },
};

const SHOWN = 4;

/**
 * One scheduled item, to comingup.svg: the 24px icon, the label in grey 13px
 * after it, the amount in ink from x = 228 (in line with Recent activity), and when it happens in grey on the
 * right. Rows are 24px tall and 8px apart.
 */
const UpcomingRow = ({ u }: { u: UpcomingItem }) => (
  <li className="grid h-6 grid-cols-[24px_minmax(0,1fr)_87px_64px] items-center gap-x-[13px] text-[14px] leading-none">
    {UPCOMING_ICON[u.kind] ?? (
      <span
        className={`grid size-6 place-items-center rounded-full [&_svg]:size-3 ${UPCOMING_LOOK[u.kind].tone}`}
      >
        {UPCOMING_LOOK[u.kind].icon}
      </span>
    )}
    <span className="truncate text-ds-muted">{u.title}</span>
    <span className="font-medium text-ds-ink">{u.amountUsd === null ? "" : usd(u.amountUsd)}</span>
    <span className="text-right text-ds-muted">{relDay(u.date)}</span>
  </li>
);

export const Upcoming = ({ items, loading }: { items: readonly UpcomingItem[]; loading: boolean }) => {
  // Loan interest accrues on its own; it is a fact about the loan, not something coming up to act on.
  const shown = items.filter((u) => u.kind !== "loan").slice(0, SHOWN);
  // Only once something is scheduled; an empty card is furniture.
  if (!loading && shown.length === 0) return null;
  return (
    <RailCard label="Coming up">
      <RailHead title="Coming up" />
      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <ul className="mt-[15px] flex flex-col gap-2">
          {shown.map((u) => (
            <UpcomingRow key={`${u.kind}-${u.date}`} u={u} />
          ))}
        </ul>
      )}
    </RailCard>
  );
};

/** "+$12.42", "−$200.00": a true minus, and only ever one sign, whatever the amount arrived as. */
const signed = (e: Event) =>
  e.amount === null
    ? ""
    : `${e.flow === "in" ? "+" : e.flow === "out" ? "−" : ""}${e.amount.replace(/^[-−+]|(?<=\$)[-−]/g, "")}`;

/**
 * One past event, to activity.svg: the Coming up row with a wider amount
 * column (from x = 228), money in green, and a Pending chip after the label.
 *
 * Led by the same mark as the Activity page — the stock's own logo, the USDC
 * coin, the kind glyph when there is no asset — so a row reads the same in
 * both places. 32px rather than the page's 36: this is a summary in a rail.
 * The amount and date columns are fixed from the right, so the wider mark
 * takes from the label and the amounts still line up with Coming up.
 */
export const EventRow = ({ e, showSubtitle = false }: { e: Event; showSubtitle?: boolean }) => (
  <li
    className={`grid grid-cols-[32px_minmax(0,1fr)_87px_64px] items-center gap-x-[13px] text-[14px] leading-none ${showSubtitle ? "min-h-9" : "h-8"}`}
  >
    <ActivityMark event={e} size={32} />
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-ds-muted">{e.title}</span>
        {e.pending && (
          <span className="shrink-0">
            <StatusChip tone="pending">Pending</StatusChip>
          </span>
        )}
      </span>
      {showSubtitle && e.sub && <span className="truncate text-[11px] text-ds-muted">{e.sub}</span>}
    </span>
    <span className={`whitespace-nowrap font-medium ${e.flow === "in" ? "text-ds-up" : "text-ds-ink"}`}>
      {signed(e)}
    </span>
    <span className="text-right text-ds-muted">{shortDate(e.date)}</span>
  </li>
);

export const Recent = ({ events, loading }: { events: readonly Event[]; loading: boolean }) => {
  const shown = events.slice(0, 6);
  if (!loading && shown.length === 0) return null;
  return (
    <RailCard label="Recent activity">
      <RailHead title="Recent activity" to="/activity" linkLabel="View all" />
      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <ul className="mt-[15px] flex flex-col gap-2">
          {shown.map((e, i) => (
            <EventRow key={`${e.date}-${i}`} e={e} />
          ))}
        </ul>
      )}
    </RailCard>
  );
};
