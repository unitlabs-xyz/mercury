import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { EASE } from "../motion/config";
import { Button, ButtonLink } from "../ui/Button";
import { Chevron, InfoTip, Pagination, StatusChip } from "../ui/ds";
import { Close, Download, Search } from "../ui/icons";
import { type Event, type Group } from "./activity-data";
import { downloadCsv } from "./activity-export";
import { MONTH_OPTIONS, TYPE_OPTIONS, filterEvents, groupByDay, yearOptions } from "./activity-filters";
import { useEvents } from "./useEvents";
import { EVENT_ICON } from "./portfolio/Feed";
import { Select } from "../ui/Select";
import { useActivityParams } from "./useActivityParams";
import { AppShell } from "./AppShell";

/** "+$12.42", "−$200.00": one true sign, money in green. */
const Amount = ({ event }: { event: Event }) => {
  if (!event.amount) return null;
  const sign = event.flow === "in" ? "+" : event.flow === "out" ? "−" : "";
  return (
    <span
      className={`text-[14px] leading-none font-medium whitespace-nowrap ${event.flow === "out" ? "text-ds-ink" : "text-ds-up"}`}
    >
      {sign}
      {event.amount}
    </span>
  );
};

/**
 * One event: a 60px row on the grey panel, as the list rows are, that turns
 * white under the pointer and opens in place to its details and the
 * transaction behind it.
 */
const Row = ({ event }: { event: Event }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`rounded-md transition-colors ${open ? "bg-white" : "hover:bg-white"}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`event-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-15 w-full items-center gap-3 px-4 text-left"
      >
        <span className="shrink-0 [&>svg]:size-9">{EVENT_ICON[event.kind]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-[5px]">
            <span className="truncate text-[14px] leading-[18px] font-medium text-ds-ink">{event.title}</span>
            {event.pending && (
              <span className="shrink-0">
                <StatusChip tone="pending">Pending</StatusChip>
              </span>
            )}
          </span>
          {event.sub && (
            <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">{event.sub}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Amount event={event} />
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="inline-flex text-ds-muted"
          >
            <Chevron />
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
            transition={{ height: { duration: 0.3, ease: EASE }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pl-[64px]">
              {event.details.length > 0 && (
                <dl className="flex flex-col gap-3">
                  {event.details.map((d) => (
                    <div
                      key={d.label}
                      className="flex h-5 items-center justify-between gap-6 text-[14px] leading-none"
                    >
                      <dt className="text-ds-muted">{d.label}</dt>
                      <dd
                        className={`text-right font-medium ${
                          d.tone === "up"
                            ? "text-ds-up"
                            : d.tone === "down"
                              ? "text-ds-down"
                              : d.tone === "muted"
                                ? "text-ds-muted"
                                : "text-ds-ink"
                        }`}
                      >
                        {d.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {event.signature ? (
                <a
                  href={`https://solscan.io/tx/${event.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${event.details.length ? "mt-4" : ""} flex items-center justify-between gap-4 rounded-lg bg-ds-panel px-3 py-2.5 text-[12px] text-ds-muted transition-colors hover:text-ds-ink`}
                >
                  <span className="truncate font-mono">{event.signature}</span>
                  <span className="flex shrink-0 items-center gap-[5px] font-medium text-ds-link">
                    View on chain
                    <Chevron />
                  </span>
                </a>
              ) : (
                <p
                  className={`${event.details.length ? "mt-4" : ""} rounded-lg bg-ds-panel px-3 py-2.5 text-[12px] text-ds-muted`}
                >
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

/** An empty panel: one line and, where it helps, one action. */
const Blank = ({ title, body, action }: { title: string; body: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <p className="text-[14px] leading-none font-medium text-ds-ink">{title}</p>
    <p className="mt-3 max-w-[44ch] text-[14px] leading-[1.45] text-ds-muted">{body}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

const PER_PAGE = 10;

export const Activity = () => {
  const { group, year, month, query, page, write, reset } = useActivityParams();
  const { events } = useEvents();
  const total = events.length;

  const filtered = useMemo(
    () => filterEvents(events, group, year, month, query),
    [events, group, year, month, query],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const days = useMemo(() => groupByDay(slice), [slice]);

  const narrowed = group !== "all" || year !== "all" || month !== "all" || query.trim() !== "";

  const from = filtered.length === 0 ? 0 : (current - 1) * PER_PAGE + 1;
  const to = Math.min(current * PER_PAGE, filtered.length);

  return (
    <AppShell current="activity" title="Activity" quiet>
      <section aria-label="Activity" className="min-w-0 rounded-xl bg-white p-1">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 text-[14px] leading-none">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="text-[20px] leading-none font-medium text-ds-ink">Activity</h1>
            <span className="text-ds-muted">
              {filtered.length === 0
                ? narrowed
                  ? `0 of ${total}`
                  : ""
                : pages > 1
                  ? `${from}–${to} of ${filtered.length}`
                  : narrowed
                    ? `${filtered.length} of ${total}`
                    : `${total} ${total === 1 ? "event" : "events"}`}
            </span>
            <InfoTip label="About this list" align="start">
              Every row links to the transaction on Solana. Nothing here is a number you have to take on
              trust.
            </InfoTip>
          </div>
          <Button icon={<Download />} onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-1 px-5">
          <Select
            label="Type"
            value={group}
            options={TYPE_OPTIONS}
            onChange={(v) => write({ group: v as Group })}
            widthClass="w-[178px]"
          />
          <Select
            label="Year"
            value={year}
            options={yearOptions(events)}
            onChange={(v) => write({ year: v })}
            widthClass="w-[150px]"
          />
          <Select
            label="Month"
            value={month}
            options={MONTH_OPTIONS}
            onChange={(v) => write({ month: v })}
            widthClass="w-[168px]"
          />
          <label className="flex h-8 w-full items-center gap-2 rounded-lg bg-ds-panel px-3 text-ds-muted sm:ml-auto sm:w-[237px]">
            <Search className="size-3.5 shrink-0" />
            <input
              value={query}
              // Typing replaces rather than pushes, so Back does not walk
              // through every keystroke.
              onChange={(e) => write({ query: e.target.value }, { replace: true })}
              type="search"
              placeholder="Search events"
              aria-label="Search activity"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ds-ink outline-none placeholder:text-ds-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => write({ query: "" }, { replace: true })}
                aria-label="Clear search"
                className="shrink-0 text-ds-muted transition-colors hover:text-ds-ink"
              >
                <Close className="size-3.5" />
              </button>
            )}
          </label>
        </div>

        <div className="mt-3 rounded-lg bg-ds-panel p-1">
          {total === 0 ? (
            <Blank
              title="Nothing has happened yet"
              body="Every buy, sell, dividend and transfer will show here, each with the transaction behind it one tap away."
              action={
                <ButtonLink to="?add=cash" variant="primary">
                  Add cash to start
                </ButtonLink>
              }
            />
          ) : filtered.length === 0 ? (
            <Blank
              title="Nothing matches that"
              body="Try a different word, or widen the filter."
              action={<Button onClick={reset}>Clear filters</Button>}
            />
          ) : (
            days.map((day) => (
              <div key={day.date}>
                <h2 className="px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted">
                  {day.label}
                </h2>
                <div className="flex flex-col gap-1">
                  {/* Date and title are not unique: two "Received SOL" on one day
                      collide, and React drops one of them. The signature is the
                      real identity; only rows without one fall back to position. */}
                  {day.events.map((event, i) => (
                    <Row key={event.signature ?? `${event.date}-${event.title}-${i}`} event={event} />
                  ))}
                </div>
              </div>
            ))
          )}
          {pages > 1 && (
            <div className="pt-3 pb-[17px]">
              <Pagination page={current - 1} count={pages} onPage={(n) => write({ page: n + 1 })} />
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
};
