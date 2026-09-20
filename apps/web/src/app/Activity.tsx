import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EASE } from "../motion/config";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  Grid,
  List,
  Plus,
  Refresh,
  Repeat,
  Trend,
} from "../ui/icons";
import { ACTIVITY, type Event, type EventKind } from "./activity-data";
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
  const look = LOOK[event.kind];

  return (
    <div className="border-b border-hair last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`event-${event.id}`}
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
              <span className="rounded bg-warn-tint px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-warn uppercase">
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
            id={`event-${event.id}`}
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
      className="mt-6 rounded-[9px] bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
    >
      Add cash to start
    </Link>
  </div>
);

export const Activity = () => {
  const count = ACTIVITY.reduce((n, d) => n + d.events.length, 0);

  return (
    <AppShell
      current="activity"
      title="Activity"
      aside={<span className="text-[13px] text-muted">{count} events</span>}
    >
      <section className="mt-6 overflow-hidden rounded-2xl border border-cardline bg-white">
        {count === 0 ? (
          <Empty />
        ) : (
          ACTIVITY.map((day) => (
            <div key={day.date}>
              <h2 className="border-b border-hair bg-shell/60 px-5 py-2.5 text-[12px] font-semibold tracking-[0.04em] text-faint uppercase sm:px-6">
                {day.date}
              </h2>
              {day.events.map((event) => (
                <Row key={event.id} event={event} />
              ))}
            </div>
          ))
        )}
      </section>

      <p className="mt-4 text-[13px] text-muted">
        Every row links to the transaction on Solana. Nothing here is a number you have to take on
        trust.
      </p>
    </AppShell>
  );
};
