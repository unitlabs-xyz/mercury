import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EASE } from "../motion/config";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  Close,
  Grid,
  List,
  Plus,
  Refresh,
  Repeat,
  Search,
  Trend,
  Download,
} from "../ui/icons";
import { type Event, type EventKind, type Group } from "./activity-data";
import { downloadCsv } from "./activity-export";
import {
  MONTH_OPTIONS,
  TYPE_OPTIONS,
  YEAR_OPTIONS,
  filterEvents,
  groupByDay,
} from "./activity-filters";
import { Select } from "../ui/Select";
import { useActivityParams } from "./useActivityParams";
import { AppShell } from "./AppShell";

const LOOK: Record<EventKind, { icon: ReactNode; tone: string }> = {
  buy: { icon: <Trend className="size-4" />, tone: "bg-brand-tint text-brand" },
  sell: { icon: <ArrowDown className="size-4" />, tone: "bg-chip text-ink-soft" },
  basket: { icon: <Grid className="size-4" />, tone: "bg-brand-tint text-brand" },
  recurring: { icon: <Repeat className="size-4" />, tone: "bg-brand-tint text-brand" },
  dividend: { icon: <Refresh className="size-4" />, tone: "bg-up-tint text-up-deep" },
  receive: { icon: <ArrowDown className="size-4" />, tone: "bg-up-tint text-up-deep" },
  send: { icon: <ArrowUp className="size-4" />, tone: "bg-chip text-ink-soft" },
  interest: { icon: <Plus className="size-4" />, tone: "bg-up-tint text-up-deep" },
  queued: { icon: <Clock className="size-4" />, tone: "bg-warn-tint text-warn" },
};

const Amount = ({ event }: { event: Event }) => {
  if (!event.amount) return null;
  const tone =
    event.flow === "in" ? "text-up-deep" : event.flow === "out" ? "text-ink" : "text-up-deep";
  const sign = event.flow === "in" ? "+" : event.flow === "out" ? "−" : "";
  return (
    <span className={`text-[14px] font-semibold tabular-nums ${tone}`}>
      {sign}
      {event.amount}
    </span>
  );
};

const Row = ({ event }: { event: Event }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const look = LOOK[event.kind];

  return (
    <div className="border-b border-hair last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`event-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-shell sm:px-6"
      >
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${look.tone}`}>
          {look.icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{event.title}</span>
            {event.pending && (
              <span className="rounded bg-warn-tint px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-warn uppercase">
                Pending
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[13px] leading-[1.45] text-muted">{event.sub}</span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          <Amount event={event} />
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="inline-flex text-faint"
          >
            <ChevronRight className="size-4" />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`event-${id}`}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3, ease: EASE },
              opacity: { duration: 0.22, delay: open ? 0.06 : 0 },
            }}
            className="overflow-hidden"
          >
            <div className="mx-5 mb-5 rounded-xl bg-shell p-5 sm:mx-6">
              <dl className="grid gap-2.5">
                {event.details.map((d) => (
                  <div key={d.label} className="flex items-baseline justify-between gap-6">
                    <dt className="text-[13px] text-muted">{d.label}</dt>
                    <dd
                      className={`text-right text-[13px] font-medium tabular-nums ${
                        d.tone === "up"
                          ? "text-up-deep"
                          : d.tone === "down"
                            ? "text-down-deep"
                            : d.tone === "muted"
                              ? "text-faint"
                              : "text-ink"
                      }`}
                    >
                      {d.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {event.signature ? (
                <a
                  href={`https://solscan.io/tx/${event.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-between gap-4 border-t border-cardline pt-4 text-[12px] text-brand underline-offset-4 hover:underline"
                >
                  <span className="truncate font-mono">{event.signature}</span>
                  <span className="shrink-0 font-semibold">View on chain</span>
                </a>
              ) : (
                <p className="mt-4 border-t border-cardline pt-4 text-[12px] text-faint">
                  Nothing on chain yet. The order rests until its price is met.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NoMatch = ({ onClear }: { onClear: () => void }) => (
  <div className="grid place-items-center px-6 py-16 text-center">
    <span className="grid size-12 place-items-center rounded-full bg-shell text-faint">
      <Search className="size-5" />
    </span>
    <p className="mt-4 text-[16px] font-semibold">Nothing matches that</p>
    <p className="mt-1.5 max-w-[38ch] text-[14px] leading-[1.5] text-muted text-pretty">
      Try a different word, or widen the filter.
    </p>
    <button
      type="button"
      onClick={onClear}
      className="mt-5 rounded-[9px] border border-btnline bg-white px-4 py-2 max-sm:min-h-11 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
    >
      Clear filters
    </button>
  </div>
);

const Empty = () => (
  <div className="grid place-items-center px-6 py-20 text-center">
    <span className="grid size-12 place-items-center rounded-full bg-shell text-faint">
      <List className="size-5" />
    </span>
    <p className="mt-4 text-[16px] font-semibold">Nothing has happened yet</p>
    <p className="mt-1.5 max-w-[42ch] text-[14px] leading-[1.5] text-muted text-pretty">
      Every buy, sell, dividend and transfer will show here, each with the transaction behind it
      one tap away.
    </p>
    <Link
      to="/money"
      className="mt-6 rounded-[9px] bg-brand px-5 py-2.5 max-sm:min-h-11 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
    >
      Add cash to start
    </Link>
  </div>
);

import { ACTIVITY } from "./activity-data";

const PER_PAGE = 10;
const TOTAL = ACTIVITY.length;

export const Activity = () => {
  const { group, year, month, query, page, write, reset } = useActivityParams();

  const filtered = useMemo(
    () => filterEvents(group, year, month, query),
    [group, year, month, query],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const days = useMemo(() => groupByDay(slice), [slice]);

  const narrowed = group !== "all" || year !== "all" || month !== "all" || query.trim() !== "";

  const from = filtered.length === 0 ? 0 : (current - 1) * PER_PAGE + 1;
  const to = Math.min(current * PER_PAGE, filtered.length);

  return (
    <AppShell
      current="activity"
      title="Activity"
      aside={
        <span className="text-[13px] text-muted tabular-nums">
          {narrowed ? `${filtered.length} of ${TOTAL} events` : `${TOTAL} events`}
        </span>
      }
      actions={
        <button
          type="button"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
          className="flex items-center gap-[7px] rounded-[9px] border border-btnline bg-white px-3.5 py-2.5 max-sm:min-h-11 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint disabled:cursor-not-allowed disabled:text-faint"
        >
          <Download className="size-[15px]" />
          Export CSV
        </button>
      }
    >
      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select label="Type" value={group} options={TYPE_OPTIONS} onChange={(v) => write({ group: v as Group })} widthClass="w-[178px]" />
          <Select label="Year" value={year} options={YEAR_OPTIONS} onChange={(v) => write({ year: v })} widthClass="w-[150px]" />
          <Select label="Month" value={month} options={MONTH_OPTIONS} onChange={(v) => write({ month: v })} widthClass="w-[168px]" />
        </div>

        <label className="flex items-center gap-2.5 rounded-[9px] border border-cardline bg-white px-3.5 py-2.5 focus-within:border-brand xl:w-[280px]">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            value={query}
            // Typing replaces rather than pushes, so Back does not walk
            // through every keystroke.
            onChange={(e) => write({ query: e.target.value }, { replace: true })}
            type="search"
            placeholder="Search events"
            aria-label="Search activity"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => write({ query: "" }, { replace: true })}
              aria-label="Clear search"
              className="shrink-0 text-faint transition-colors hover:text-ink"
            >
              <Close className="size-4" />
            </button>
          )}
        </label>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-cardline bg-white">
        {TOTAL === 0 ? (
          <Empty />
        ) : filtered.length === 0 ? (
          <NoMatch onClear={reset} />
        ) : (
          days.map((day) => (
            <div key={day.date}>
              <h2 className="border-b border-hair bg-shell/60 px-5 py-2.5 text-[12px] font-semibold tracking-[0.04em] text-faint uppercase sm:px-6">
                {day.label}
              </h2>
              {day.events.map((event) => (
                <Row key={event.date + event.title} event={event} />
              ))}
            </div>
          ))
        )}
      </section>

      {filtered.length > 0 && (
        <nav
          aria-label="Pagination"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-[13px] text-muted tabular-nums">
            Showing {from}–{to} of {filtered.length}
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => write({ page: current - 1 })}
              disabled={current === 1}
              aria-label="Previous page"
              className="grid size-11 place-items-center rounded-[9px] border border-cardline bg-white text-ink-soft transition-colors hover:border-faint disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-cardline sm:size-9"
            >
              <ChevronRight className="size-4 rotate-180" />
            </button>

            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => write({ page: n })}
                aria-current={n === current ? "page" : undefined}
                className={`grid size-11 place-items-center rounded-[9px] text-[13px] font-medium tabular-nums transition-colors sm:size-9 ${
                  n === current
                    ? "bg-ink text-white"
                    : "border border-cardline bg-white text-ink-soft hover:border-faint"
                }`}
              >
                {n}
              </button>
            ))}

            <button
              type="button"
              onClick={() => write({ page: current + 1 })}
              disabled={current === pages}
              aria-label="Next page"
              className="grid size-11 place-items-center rounded-[9px] border border-cardline bg-white text-ink-soft transition-colors hover:border-faint disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-cardline sm:size-9"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </nav>
      )}

      <p className="mt-4 text-[13px] text-muted">
        Every row links to the transaction on Solana. Nothing here is a number you have to take on
        trust.
      </p>
    </AppShell>
  );
};
