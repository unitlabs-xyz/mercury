import { AnimatePresence, motion } from "motion/react";
import { memo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usd } from "@mercury/view";
import { Skeleton } from "../portfolio/ui";
import { GlideRows, MoveChip, RailCard, RailHead } from "../../ui/ds";
import { DotChart, TINY } from "../DotChart";
import { LIST_DOT, Mark, compact, points, type Row } from "./shared";

/**
 * One stock in a rail list (Watchlist, Top movers, Most bought), to
 * waitlist.svg: the 32px mark, the name at 14 medium over ticker and sector at
 * 12, an 84 × 28 dot-matrix sparkline, and the price over its move chip on the
 * right, in a 52px row. It is the hover sheet's `data-row`.
 */
export const Saved = memo(({ r, sub }: { r: Row; sub?: string }) => (
  <Link
    data-row
    to={`/invest/${r.instrument.ticker}`}
    className="relative grid h-[52px] grid-cols-[minmax(0,1fr)_84px_56px] items-center gap-x-3 rounded-md px-3"
  >
    <span className="flex min-w-0 items-center gap-3">
      <Mark i={r.instrument} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
          {r.instrument.name}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
          {r.instrument.ticker} · {sub ?? r.instrument.sector}
        </span>
      </span>
    </span>
    <span className="flex items-center">
      <span className="block h-7 w-full">
        {r.spark && (
          <DotChart
            scale="price"
            series={points(r.spark, "1D")}
            label="today"
            axes={false}
            interactive={false}
            rest={LIST_DOT}
            {...TINY}
          />
        )}
      </span>
    </span>
    <span className="flex flex-col items-end">
      <span className="text-[14px] leading-[18px] font-medium whitespace-nowrap text-ds-ink">
        {r.fair === null ? "—" : usd(r.fair)}
      </span>
      <span>
        <span className="mt-0.5">
          <MoveChip value={r.change} light />
        </span>
      </span>
    </span>
  </Link>
));
Saved.displayName = "Saved";

/** Opening and folding a watchlist row: the page's ease, a touch quicker than the default. */
const FOLD = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * One watchlist row that opens into place: its height grows from nothing
 * while it fades in, and the rows below slide to make room; removed, it folds
 * back out the same way. Motion drives it, so a row clicked off halfway in
 * turns round from where it is, and one saved again while folding reopens
 * from there. Rows after the first carry the list's 4px gap inside them, so
 * the gap closes with the row and nothing jumps at the end. (`first-of-type`,
 * because the hover sheet is the list's first child.)
 */
const Fold = ({ children }: { children: ReactNode }) => (
  <motion.li
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: "auto", opacity: 1 }}
    exit={{ height: 0, opacity: 0, pointerEvents: "none" }}
    transition={{ height: FOLD, opacity: { ...FOLD, duration: 0.24 } }}
    className="overflow-hidden [&:not(:first-of-type)]:pt-1"
  >
    {children}
  </motion.li>
);

/**
 * A rail card holding a list, laid out like the holdings table: the title
 * row, any controls under it, then a grey panel 4px in from the card's edge
 * whose rows share one gliding white hover sheet. Watchlist, Top movers, Most
 * bought, and Similar on the stock page.
 */
export const RailList = ({
  label,
  meta,
  controls,
  to,
  linkLabel,
  children,
}: {
  label: string;
  meta?: string | undefined;
  controls?: ReactNode;
  /** An optional link out on the title row, as the rail cards have. */
  to?: string;
  linkLabel?: string;
  children: ReactNode;
}) => (
  <section aria-label={label} className="min-w-0 rounded-xl bg-white p-1">
    <div className="px-5 pt-4">
      <RailHead title={label} meta={meta} {...(to && linkLabel ? { to, linkLabel } : {})} />
      {controls && <div className="mt-[15px]">{controls}</div>}
    </div>
    <div className={`${controls ? "mt-3" : "mt-[11px]"} rounded-lg bg-ds-panel p-1`}>{children}</div>
  </section>
);

const ListLoading = () => (
  <div className="flex flex-col gap-3 p-3">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-9 w-full" />
    ))}
  </div>
);

/** An empty list, the height of one row (52px) so the card keeps its size when the last row goes. */
const ListEmpty = ({ children }: { children: ReactNode }) => (
  <p className="flex h-[52px] items-center px-3 text-[14px] leading-[17px] text-ds-muted">
    <span className="line-clamp-2">{children}</span>
  </p>
);

/**
 * Every stock saved with its bookmark, newest first, the card growing with it, laid
 * out like the holdings table: the title row, then a grey panel 4px in from
 * the card's edge whose rows share one gliding white hover sheet. A new save
 * opens into the top of the list; a removed one folds away. Rows there when
 * the list first shows (opening the page, coming back to it) just appear.
 */
export const Watchlist = ({ rows, loading }: { rows: readonly Row[]; loading: boolean }) => {
  const list = rows;
  return (
    <RailList label="Watchlist" meta={rows.length ? `${rows.length} saved` : undefined}>
      {loading ? (
        <ListLoading />
      ) : (
        <>
          <AnimatePresence initial={false}>
            {list.length === 0 && (
              <motion.div
                key="empty"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={FOLD}
                className="overflow-hidden"
              >
                <ListEmpty>
                  Save any stock with its bookmark to follow it here. Kept on this device.
                </ListEmpty>
              </motion.div>
            )}
          </AnimatePresence>
          <GlideRows as="ul" gap="gap-0">
            <AnimatePresence initial={false}>
              {list.map((r) => (
                <Fold key={r.instrument.ticker}>
                  <Saved r={r} />
                </Fold>
              ))}
            </AnimatePresence>
          </GlideRows>
        </>
      )}
    </RailList>
  );
};

/**
 * The day's biggest moves, one direction at a time, so up and down are never
 * ranked against each other. To top.svg: the rail title with "Today", a
 * Gainers / Losers pair of 26px pills (the chosen one raised on the
 * white-to-grey key, the other grey text), then the watchlist's rows.
 */
export const Movers = ({ rows, loading }: { rows: readonly Row[]; loading: boolean }) => {
  const [side, setSide] = useState<"up" | "down">("up");
  const list = [...rows]
    .filter((r) => (side === "up" ? r.change > 0 : r.change < 0))
    .sort((a, b) => (side === "up" ? b.change - a.change : a.change - b.change))
    .slice(0, 5);
  return (
    <RailList
      label="Top movers"
      meta="Today"
      controls={
        <div className="flex" role="group" aria-label="Direction">
          {(["up", "down"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              aria-pressed={side === s}
              className={`h-[26px] rounded-full border px-4 text-[14px] leading-none transition-colors ${
                side === s
                  ? "border-black/10 bg-linear-to-b from-white to-[#eeeeee] text-ds-ink"
                  : "border-transparent text-ds-muted hover:text-ds-ink"
              }`}
            >
              {s === "up" ? "Gainers" : "Losers"}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <ListLoading />
      ) : list.length === 0 ? (
        <ListEmpty>Nothing {side === "up" ? "rose" : "fell"} today.</ListEmpty>
      ) : (
        <GlideRows as="ul">
          {list.map((r) => (
            <li key={r.instrument.ticker}>
              <Saved r={r} />
            </li>
          ))}
        </GlideRows>
      )}
    </RailList>
  );
};

/** Where people are putting money on chain: net buyers over sellers, not what we feature. The watchlist's rows, the buyers in place of the sector. */
export const MostBought = ({ rows, loading }: { rows: readonly Row[]; loading: boolean }) => {
  const list = [...rows]
    .filter((r) => r.netBuyers24h > 0)
    .sort((a, b) => b.netBuyers24h - a.netBuyers24h)
    .slice(0, 5);
  return (
    <RailList label="Most bought" meta="Net buyers, 24h">
      {loading ? (
        <ListLoading />
      ) : list.length === 0 ? (
        <ListEmpty>More sellers than buyers everywhere today.</ListEmpty>
      ) : (
        <GlideRows as="ul">
          {list.map((r) => (
            <li key={r.instrument.ticker}>
              <Saved r={r} sub={`+${compact(r.netBuyers24h)} buyers`} />
            </li>
          ))}
        </GlideRows>
      )}
    </RailList>
  );
};

/**
 * Each sector's average move, equal-weighted across what we list. Picking one
 * filters the table, so this doubles as the way into a sector. To
 * sectors.svg, spaced like Coming up: a rail card, the name at 14 grey, the
 * count of stocks at 272 from the card's left, the 56px move chip at the end;
 * 20px rows, 12 apart, 15 under the title. Each row sits in a 32px hit area
 * under a gliding grey hover sheet.
 */
export const Sectors = ({
  rows,
  loading,
  current,
  onPick,
}: {
  rows: readonly Row[];
  loading: boolean;
  current: string;
  onPick: (s: string) => void;
}) => {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.instrument.sector, [...(by.get(r.instrument.sector) ?? []), r.change]);
  const list = [...by]
    .map(([name, ch]) => ({ name, n: ch.length, avg: ch.reduce((s, v) => s + v, 0) / ch.length }))
    .sort((a, b) => b.avg - a.avg);
  return (
    <RailCard label="Sectors">
      <RailHead title="Sectors" meta="Today" />
      {loading ? (
        <div className="mt-[15px] flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        // 32px rows edge to edge, 8px wider than the text each side, so the
        // grey hover sheet has room around the 20px chip; the text keeps its place.
        <div className="-mx-2 mt-[9px]">
          <GlideRows as="ul" gap="gap-0" sheet="bg-ds-panel">
            {list.map((s) => {
              const on = current === s.name;
              return (
                <li key={s.name} data-row>
                  <button
                    type="button"
                    onClick={() => onPick(on ? "All" : s.name)}
                    aria-pressed={on}
                    title={on ? "Show every sector" : `Show only ${s.name}`}
                    className="group relative grid h-8 w-full grid-cols-[minmax(0,1fr)_64px_56px] items-center rounded-md px-2 text-left text-[14px] leading-none"
                  >
                    <span
                      className={`truncate transition-colors ${
                        on ? "font-medium text-ds-ink" : "text-ds-muted group-hover:text-ds-ink"
                      }`}
                    >
                      {s.name}
                    </span>
                    <span className="text-ds-ink" aria-label={`${s.n} ${s.n === 1 ? "stock" : "stocks"}`}>
                      {s.n}
                    </span>
                    <MoveChip value={s.avg} light />
                  </button>
                </li>
              );
            })}
          </GlideRows>
        </div>
      )}
    </RailCard>
  );
};
