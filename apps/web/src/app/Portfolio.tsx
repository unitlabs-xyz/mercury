import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronRight, Clock, Plus, Refresh, Trend } from "../ui/icons";
import { AppShell } from "./AppShell";
import { EVENTS, HOLDINGS, MARKET, SPLIT, TOTAL, type Range } from "./data";
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

/**
 * The statement head: the one figure the page exists for, printed on the paper
 * rather than boxed, with its history beside it. A card here would make the
 * total a peer of everything under it.
 */
const Position = ({ range, setRange }: { range: Range; setRange: (r: Range) => void }) => (
  <section aria-label="Total value" className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
    <div>
      <p className="text-[13px] font-medium text-muted">Total value</p>
      <p className="mt-1.5 text-[42px] leading-[1.1] font-semibold tracking-[-0.035em]">
        {TOTAL.value}
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-2.5">
        <span className="flex items-center gap-1 rounded-md bg-up-tint py-[3px] pr-[9px] pl-[7px] text-[14px] font-semibold text-up-deep">
          <ArrowUp className="size-3" />
          {TOTAL.changePct}
        </span>
        <span className="text-[14px] font-medium text-up-deep">{TOTAL.changeUsd}</span>
        <span className="text-[13px] text-faint">{TOTAL.since}</span>
      </p>

      {/* Stated, not drawn. The share is the number, so it does not need a bar. */}
      <dl className="mt-7 border-t border-rule">
        {SPLIT.map((s) => {
          const [name, note] = s.label.split(" · ");
          return (
            <div key={s.label} className="flex items-baseline gap-4 border-b border-hair py-2.5">
              <dt className="flex-1 text-[14px] text-ink-soft">
                {name}
                {note && <span className="ml-1.5 text-[12px] text-faint">{note}</span>}
              </dt>
              <dd className="w-[44px] text-right text-[13px] tabular-nums text-faint">
                {Math.round(s.share)}%
              </dd>
              <dd className="w-[92px] text-right text-[14px] font-semibold tabular-nums">
                {s.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>

    <div className="min-w-0">
      {/* Stranded on the right when the chart is the whole column. */}
      <div className="flex justify-start lg:justify-end">
        <div className="flex gap-1 rounded-lg bg-chip p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`min-h-11 rounded-md px-3.5 font-mono text-[12px] transition-colors sm:min-h-0 sm:px-2.5 sm:py-1 ${
                range === r
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(27,26,23,0.07)]"
                  : "text-muted hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <ValueChart range={range} />
      </div>
    </div>
  </section>
);

export const Portfolio = () => {
  const [range, setRange] = useState<Range>("1Y");

  return (
    <AppShell
      current="portfolio"
      title="Portfolio"
      aside={
        /* The sidebar stamps this already; it is only needed where that is hidden. */
        <span className="flex items-center gap-1.5 rounded-full bg-warn-tint px-2.5 py-1 text-[12px] font-medium text-warn lg:hidden">
          <Clock className="size-[13px]" />
          {MARKET}
        </span>
      }
      actions={
        <>
          <Link
            to="/money"
            className="flex items-center gap-[7px] rounded-[9px] border border-btnline bg-white px-3.5 py-2.5 max-sm:min-h-11 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
          >
            <Plus className="size-[15px]" />
            Add cash
          </Link>
          <Link
            to="/invest"
            className="flex items-center gap-[7px] rounded-[9px] bg-brand px-4 py-2.5 max-sm:min-h-11 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Trend className="size-[15px]" />
            Invest
          </Link>
        </>
      }
    >
      <Welcome />

      <div className="mt-8">
        <Position range={range} setRange={setRange} />
      </div>

      <section aria-label="Holdings" className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Holdings</h2>
          <span className="text-[13px] text-muted">
            {HOLDINGS.length} positions, largest first
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-cardline bg-white">
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
                      <span className="rounded bg-chip px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
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
        </div>
      </section>

      {/* Notes at the foot of a statement, not cards in the middle of one. */}
      <section aria-label="Recent" className="mt-14">
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Recent</h2>
        <ul className="mt-4 border-t border-rule">
          {EVENTS.map((e) => (
            <li key={e.title} className="flex items-start gap-3.5 border-b border-hair py-4">
              <span
                className={`mt-px grid size-7 shrink-0 place-items-center rounded-lg ${
                  e.kind === "dividend" ? "bg-up-tint text-up-deep" : "bg-warn-tint text-warn"
                }`}
              >
                {e.kind === "dividend" ? (
                  <Refresh className="size-[15px]" />
                ) : (
                  <Clock className="size-[15px]" />
                )}
              </span>
              <p className="min-w-0 flex-1 text-[14px] leading-[1.55] text-muted text-pretty">
                <span className="font-semibold text-ink">{e.title}</span>
                <span className="mx-1.5 text-faint">·</span>
                {e.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
};
