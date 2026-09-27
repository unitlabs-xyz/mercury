import type { ReactNode } from "react";
import type { Upcoming as UpcomingItem } from "../../api/dashboard";
import { Card, Clock, Plus, Refresh, Repeat, Trend } from "../../ui/icons";
import type { Event } from "../activity-data";
import { RailCard, RailHead, StatusChip } from "../../ui/ds";
import { usd } from "../format";
import { Skeleton, relDay, shortDate } from "./ui";

const UPCOMING_LOOK: Record<UpcomingItem["kind"], { icon: ReactNode; tone: string }> = {
  recurring: { icon: <Repeat />, tone: "bg-brand-tint text-brand" },
  queued: { icon: <Clock />, tone: "bg-warn-tint text-warn" },
  card: { icon: <Card />, tone: "bg-chip text-ink-soft" },
  interest: { icon: <Plus />, tone: "bg-up-tint text-up-deep" },
  dividend: { icon: <Refresh />, tone: "bg-up-tint text-up-deep" },
  loan: { icon: <Trend />, tone: "bg-chip text-ink-soft" },
};

const SHOWN = 4;

/**
 * The Coming up icons, drawn as in comingup.svg: a 24px tinted circle and a 1px
 * stroke glyph. Each is the design's own path, in a 24 × 24 box.
 */
const Glyph = ({ bg, ink, children }: { bg: string; ink: string; children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-hidden className="shrink-0">
    <circle cx="12" cy="12" r="12" fill={bg} />
    <g stroke={ink} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);

const UPCOMING_ICON: Partial<Record<UpcomingItem["kind"], ReactNode>> = {
  recurring: (
    <Glyph bg="var(--color-ds-up-recurring-bg)" ink="var(--color-ds-up-recurring)">
      <path d="M16.7221 8.3887H10.6114C8.5486 8.3887 7.0005 9.8803 7.0005 11.9996" />
      <path d="M7.2779 15.6113H13.3886C15.4514 15.6113 16.9995 14.1197 16.9995 12.0004" />
      <path d="M15.6113 7.0005C15.6113 7.0005 17.0001 8.0233 17.0001 8.3893C17.0001 8.7553 15.6113 9.7781 15.6113 9.7781" />
      <path d="M8.3893 14.2222C8.3893 14.2222 7.0005 15.245 7.0005 15.611C7.0005 15.977 8.3893 16.9998 8.3893 16.9998" />
    </Glyph>
  ),
  queued: (
    <Glyph bg="var(--color-ds-up-queued-bg)" ink="var(--color-ds-up-queued)">
      <circle cx="12" cy="12" r="6" />
      <path d="M12 9.6001V12.0001L13.2 13.2001" />
    </Glyph>
  ),
  interest: (
    <Glyph bg="var(--color-ds-up-interest-bg)" ink="var(--color-ds-up-interest)">
      <path d="M12 7V17M17 12H7" />
    </Glyph>
  ),
  card: (
    <Glyph bg="var(--color-ds-up-card-bg)" ink="var(--color-ds-up-card)">
      <path d="M7 9.556H13.6667C15.238 9.556 16.0237 9.556 16.5118 10.044C17 10.532 17 11.318 17 12.889V13.445C17 15.016 17 15.802 16.5118 16.29C16.0237 16.778 15.238 16.778 13.6667 16.778H10.3333C8.762 16.778 7.9763 16.778 7.4882 16.29C7 15.802 7 15.016 7 13.445V9.556Z" />
      <path d="M13.6667 9.555V7.117C13.6667 6.623 13.2661 6.222 12.7721 6.222C12.6298 6.222 12.4895 6.256 12.363 6.321L7.4235 8.861C7.1635 8.994 7 9.262 7 9.555" />
      <path d="M15.0556 13.444C15.209 13.444 15.3334 13.32 15.3334 13.166C15.3334 13.013 15.209 12.889 15.0556 12.889M15.0556 13.444C14.9022 13.444 14.7778 13.32 14.7778 13.166C14.7778 13.013 14.9022 12.889 15.0556 12.889M15.0556 13.444V12.889" />
    </Glyph>
  ),
};

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
  return (
    <RailCard label="Coming up">
      <RailHead title="Coming up" />
      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-[14px] text-ds-muted">Nothing scheduled.</p>
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

const SEND_UP = (
  <>
    <path d="M12 7.6665V16.6665" />
    <path d="M16 11.3335C16 11.3335 13.054 7.3335 12 7.3335C10.9459 7.3335 8 11.3335 8 11.3335" />
  </>
);
const BUY_TREND = (
  <path d="M8.4722 10.02L11.4141 10.02M7 15L9.7488 12.293C9.8546 12.189 10.0198 12.177 10.139 12.265L12.2619 13.836C12.387 13.928 12.5614 13.91 12.6653 13.794L16.6424 9.351M15.0542 9H16.4653C16.7393 9 16.9629 9.22 16.9686 9.496L17 11.032" />
);

/**
 * The Recent activity icons, from activity.svg. Queued, interest and recurring
 * are the same glyphs as Coming up; receive and sell turn send and buy around.
 */
export const EVENT_ICON: Record<Event["kind"], ReactNode> = {
  send: (
    <Glyph bg="var(--color-ds-act-send-bg)" ink="var(--color-ds-act-send)">
      {SEND_UP}
    </Glyph>
  ),
  receive: (
    <Glyph bg="var(--color-ds-act-dividend-bg)" ink="var(--color-ds-act-dividend)">
      <g transform="rotate(180 12 12)">{SEND_UP}</g>
    </Glyph>
  ),
  dividend: (
    <Glyph bg="var(--color-ds-act-dividend-bg)" ink="var(--color-ds-act-dividend)">
      <path d="M8.3882 7.2779L8.3882 13.3886C8.3882 15.4514 9.8798 16.9995 11.9991 16.9995" />
      <path d="M15.6108 16.7216L15.6108 10.6109C15.6108 8.5481 14.1192 7 11.9999 7" />
      <path d="M7 8.3887C7 8.3887 8.0228 6.9999 8.3888 6.9999C8.7548 6.9999 9.7776 8.3887 9.7776 8.3887" />
      <path d="M14.2217 15.6107C14.2217 15.6107 15.2445 16.9995 15.6105 16.9995C15.9765 16.9995 16.9993 15.6107 16.9993 15.6107" />
    </Glyph>
  ),
  buy: (
    <Glyph bg="var(--color-ds-act-buy-bg)" ink="var(--color-ds-act-buy)">
      {BUY_TREND}
    </Glyph>
  ),
  basket: (
    <Glyph bg="var(--color-ds-act-buy-bg)" ink="var(--color-ds-act-buy)">
      {BUY_TREND}
    </Glyph>
  ),
  sell: (
    <Glyph bg="var(--color-ds-act-send-bg)" ink="var(--color-ds-act-send)">
      <g transform="scale(1 -1) translate(0 -24)">{BUY_TREND}</g>
    </Glyph>
  ),
  queued: UPCOMING_ICON.queued,
  interest: UPCOMING_ICON.interest,
  recurring: UPCOMING_ICON.recurring,
};

/** "+$12.42", "−$200.00": a true minus, and only ever one sign, whatever the amount arrived as. */
const signed = (e: Event) =>
  e.amount === null
    ? ""
    : `${e.flow === "in" ? "+" : e.flow === "out" ? "−" : ""}${e.amount.replace(/^[-−+]|(?<=\$)[-−]/g, "")}`;

/**
 * One past event, to activity.svg: the Coming up row with a wider amount
 * column (from x = 228), money in green, and a Pending chip after the label.
 */
const EventRow = ({ e }: { e: Event }) => (
  <li className="grid h-6 grid-cols-[24px_minmax(0,1fr)_87px_64px] items-center gap-x-[13px] text-[14px] leading-none">
    {EVENT_ICON[e.kind]}
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-ds-muted">{e.title}</span>
      {e.pending && (
        <span className="shrink-0">
          <StatusChip tone="pending">Pending</StatusChip>
        </span>
      )}
    </span>
    <span className={`whitespace-nowrap font-medium ${e.flow === "in" ? "text-ds-up" : "text-ds-ink"}`}>
      {signed(e)}
    </span>
    <span className="text-right text-ds-muted">{shortDate(e.date)}</span>
  </li>
);

export const Recent = ({ events, loading }: { events: readonly Event[]; loading: boolean }) => {
  const shown = events.slice(0, 6);
  return (
    <RailCard label="Recent activity">
      <RailHead title="Recent activity" to="/activity" linkLabel="View all" />
      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-[14px] text-ds-muted">Deposits, trades and income show up here.</p>
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
