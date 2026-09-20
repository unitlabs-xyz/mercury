import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  Plus,
  Refresh,
  Sort,
  Trend,
} from "../ui/icons";
import { Sidebar } from "./Sidebar";
import { EVENTS, HOLDINGS, MARKET, SPLIT, TOTAL, WATCHLIST, type Range } from "./data";
import { ValueChart } from "./ValueChart";
import { Welcome } from "./Welcome";

const RANGES: Range[] = ["1W", "1M", "1Y", "All"];

const Move = ({ value, dir }: { value: string; dir: "up" | "down" | "queued" }) => {
  if (dir === "queued")
    return (
      <span className="rounded-md bg-warn-tint px-[7px] py-[3px] text-[12px] font-semibold text-warn">
        {value}
      </span>
    );
  const up = dir === "up";
  return (
    <span
      className={`flex items-center gap-[3px] rounded-md px-[7px] py-[3px] text-[12px] font-semibold ${
        up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"
      }`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {value}
    </span>
  );
};

export const Portfolio = () => {
  const [range, setRange] = useState<Range>("1Y");

  return (
    <div className="flex min-h-dvh bg-page">
      <Welcome />
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-7">
        <div className="mx-auto w-full max-w-[1280px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Portfolio</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-warn-tint px-2.5 py-1 text-[12px] font-medium text-warn">
              <Clock className="size-[13px]" />
              {MARKET}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="flex items-center gap-[7px] rounded-[9px] border border-btnline bg-white px-3.5 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
            >
              <Plus className="size-[15px]" />
              Add cash
            </button>
            <button
              type="button"
              className="flex items-center gap-[7px] rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
            >
              <Trend className="size-[15px]" />
              Invest
            </button>
          </div>
        </header>

        <section
          aria-label="Watchlist"
          className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {WATCHLIST.map((w) => (
            <article
              key={w.ticker}
              className="flex items-center gap-3 rounded-[14px] border border-cardline bg-white px-4 py-3.5"
            >
              <img
                src={w.logo}
                alt=""
                width={34}
                height={34}
                loading="lazy"
                className="size-[34px] shrink-0 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] text-faint">{w.ticker}</p>
                <p className="mt-px text-[17px] font-semibold tracking-[-0.02em] tabular-nums">{w.price}</p>
              </div>
              <Move value={w.move} dir={w.dir} />
            </article>
          ))}
        </section>

        <section className="mt-[18px] grid gap-[18px] xl:grid-cols-[392px_minmax(0,1fr)]">
          <article className="flex flex-col rounded-2xl border border-cardline bg-white px-6 py-[22px]">
            <p className="text-[13px] font-medium text-muted">Total value</p>
            <p className="mt-2 text-[42px] leading-[1.1] font-semibold tracking-[-0.035em]">
              {TOTAL.value}
            </p>
            <p className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1 rounded-md bg-up-tint py-[3px] pr-[9px] pl-[7px] text-[14px] font-semibold text-up-deep">
                <ArrowUp className="size-3" />
                {TOTAL.changePct}
              </span>
              <span className="text-[14px] font-medium text-up-deep">{TOTAL.changeUsd}</span>
              <span className="text-[13px] text-faint">{TOTAL.since}</span>
            </p>

            <dl className="mt-7 grid gap-3">
              {SPLIT.map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <span className={`size-2 shrink-0 rounded-[2px] ${s.fill}`} />
                  <dt className="flex-1 text-[13px] text-ink-soft">{s.label}</dt>
                  <dd className="text-[13px] font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>

            <div
              aria-hidden
              className="mt-5 flex h-1.5 gap-[2px] overflow-hidden rounded-full"
            >
              {SPLIT.map((s, i) => (
                <span
                  key={s.label}
                  style={{ width: `${s.share}%` }}
                  className={`${s.fill} ${i === 0 ? "rounded-l-full" : ""} ${
                    i === SPLIT.length - 1 ? "rounded-r-full" : ""
                  }`}
                />
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-cardline bg-white px-6 py-[22px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium text-muted">Value over time</h2>
              <div className="flex gap-1 rounded-lg bg-shell p-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    aria-pressed={range === r}
                    className={`rounded-md px-2.5 py-1 font-mono text-[12px] transition-colors ${
                      range === r ? "bg-white text-ink shadow-[0_1px_2px_rgba(27,26,23,0.07)]" : "text-muted hover:text-ink"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <ValueChart range={range} />
            </div>
          </article>
        </section>

        <section aria-label="Recent events" className="mt-[18px] grid gap-3 lg:grid-cols-2">
          {EVENTS.map((e) => (
            <article
              key={e.title}
              className="flex items-start gap-3 rounded-[14px] border border-cardline bg-white px-4 py-3.5"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                  e.kind === "dividend" ? "bg-up-tint text-up-deep" : "bg-warn-tint text-warn"
                }`}
              >
                {e.kind === "dividend" ? (
                  <Refresh className="size-4" />
                ) : (
                  <Clock className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{e.title}</p>
                <p className="mt-1 text-[13px] leading-[1.5] text-muted text-pretty">{e.body}</p>
              </div>
              {e.kind === "queued" && (
                <ChevronRight className="mt-1 size-4 shrink-0 text-faint" />
              )}
            </article>
          ))}
        </section>

        <section
          aria-label="Holdings"
          className="mt-[18px] overflow-hidden rounded-2xl border border-cardline bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-6 py-4">
            <h2 className="text-[15px] font-semibold">Holdings</h2>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-faint">{HOLDINGS.length} positions</span>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-cardline px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-faint"
              >
                <Sort className="size-3.5" />
                Sort
              </button>
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_110px_28px] gap-4 border-b border-hair px-6 py-2.5 text-[12px] font-medium text-faint lg:grid">
            <span>Name</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Price</span>
            <span className="text-right">Value</span>
            <span className="text-right">Today</span>
            <span />
          </div>

          {HOLDINGS.map((h) => (
            <div
              key={h.name}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-hair px-6 py-4 transition-colors last:border-b-0 hover:bg-shell lg:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_110px_28px]"
            >
              <div className="flex min-w-0 items-center gap-3">
                {h.logo ? (
                  <img
                    src={h.logo}
                    alt=""
                    width={34}
                    height={34}
                    loading="lazy"
                    className="size-[34px] shrink-0 rounded-full"
                  />
                ) : (
                  <span
                    className={`grid size-[34px] shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ${h.tone}`}
                  >
                    {h.mark}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{h.name}</span>
                    {h.badge && (
                      <span className="rounded bg-chip px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-faint uppercase">
                        {h.badge}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-faint">{h.sub}</p>
                </div>
              </div>

              <span className="hidden text-right text-[14px] tabular-nums text-muted lg:block">
                {h.shares}
              </span>
              <span className="hidden text-right text-[14px] tabular-nums text-muted lg:block">
                {h.price}
              </span>
              <span className="text-right text-[15px] font-semibold tabular-nums lg:text-[14px]">
                {h.value}
              </span>
              <span className="hidden justify-end lg:flex">
                {h.today && h.dir ? (
                  <Move value={h.today} dir={h.dir} />
                ) : (
                  <span className="text-[13px] text-faint">—</span>
                )}
              </span>
              <span className="hidden justify-end text-faint lg:flex">
                <ChevronRight className="size-4" />
              </span>
            </div>
          ))}
        </section>
        </div>
      </main>
    </div>
  );
};
