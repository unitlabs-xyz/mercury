import type { ReactNode } from "react";
import type { Upcoming as UpcomingItem } from "../../api/dashboard";
import type { Event } from "@mercury/view";

/*
 * The small tinted glyphs, apart from the rows that draw them: the feed on the
 * portfolio and the activity mark both reach for these, and the activity mark
 * is what the feed's rows now show, so neither file can own them without the
 * two importing each other.
 */

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

export const UPCOMING_ICON: Partial<Record<UpcomingItem["kind"], ReactNode>> = {
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
 * The Recent activity icons, from activity.svg. Queued and interest are the same
 * glyphs as Coming up; receive and sell turn send and buy around.
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
  // Borrowing reuses the cash marks: dollars arriving and dollars leaving are
  // drawn the same whoever sent them. Collateral gets the dividend mark's tint,
  // because it is stock moving rather than money.
  borrow: (
    <Glyph bg="var(--color-ds-act-dividend-bg)" ink="var(--color-ds-act-dividend)">
      <g transform="rotate(180 12 12)">{SEND_UP}</g>
    </Glyph>
  ),
  repay: (
    <Glyph bg="var(--color-ds-act-send-bg)" ink="var(--color-ds-act-send)">
      {SEND_UP}
    </Glyph>
  ),
  pledge: (
    <Glyph bg="var(--color-ds-act-send-bg)" ink="var(--color-ds-act-send)">
      {BUY_TREND}
    </Glyph>
  ),
  unpledge: (
    <Glyph bg="var(--color-ds-act-buy-bg)" ink="var(--color-ds-act-buy)">
      {BUY_TREND}
    </Glyph>
  ),
  // The queued mark's amber, because this is the other row that is waiting on
  // the person reading it.
  loan_alert: (
    <Glyph bg="var(--color-ds-up-queued-bg)" ink="var(--color-ds-up-queued)">
      <path d="M12 7.5V13" />
      <path d="M12 16.2V16.3" />
    </Glyph>
  ),
};
