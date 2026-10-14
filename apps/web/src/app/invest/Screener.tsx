import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Span } from "../../market/hooks";
import {
  BookmarkMark,
  FilterPills,
  GlideTable,
  InfoTip,
  MoveChip,
  Pagination,
  RangeSwitch,
  SearchField,
  StatusChip,
} from "../../ui/ds";
import { DotChart, TINY } from "../DotChart";
import { usd, usdCompact } from "@mercury/view";
import { Skeleton } from "../portfolio/ui";
import { LIST_DOT, Mark, compact, points, type Row } from "./shared";

type SortKey = "name" | "price" | "change" | "volume" | "holders";

const VALUE: Record<SortKey, (r: Row) => number | string> = {
  name: (r) => r.instrument.name,
  price: (r) => r.fair ?? -1,
  change: (r) => r.change,
  volume: (r) => r.volume24h,
  holders: (r) => r.holders,
};

/** The list offers the three ranges the design shows. */
const LIST_RANGES: Span[] = ["1D", "1W", "1M"];

/** At most this many rows a page; the pager only shows when there are more. */
const PAGE = 20;

/**
 * Built to allstocks.svg. The name takes what is left; the rest sit in fixed
 * columns, right-aligned: price ends 370 from the card's left in the 992
 * design, then the move 116 on, the chart 188, volume 131, holders 98, and 65
 * for the bookmark.
 */
const COLS = "grid-cols-[minmax(0,1fr)_100px_116px_188px_131px_98px_65px]";

/** The sort arrow beside a column label: the move chip's 7 × 8 arrow in grey. */
const SortArrow = ({ desc }: { desc: boolean }) => (
  <svg viewBox="0 0 8 10" width={8} height={10} fill="none" aria-hidden className="shrink-0">
    <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {desc ? (
        <>
          <path d="M4.429 8.714L4.429 1" />
          <path d="M1 5.571C1 5.571 3.525 9 4.428 9C5.332 9 7.857 5.571 7.857 5.571" />
        </>
      ) : (
        <>
          <path d="M4.429 1.286V9" />
          <path d="M7.857 4.429C7.857 4.429 5.332 1 4.429 1C3.525 1 1 4.429 1 4.429" />
        </>
      )}
    </g>
  </svg>
);

const Head = ({
  k,
  sort,
  onSort,
  align = "right",
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  children: ReactNode;
}) => {
  const on = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-sort={on ? (sort.desc ? "descending" : "ascending") : undefined}
      className={`flex items-center gap-[6px] transition-colors hover:text-ds-ink ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      {children}
      {on && <SortArrow desc={sort.desc} />}
    </button>
  );
};

/**
 * One stock, to allstocks.svg: a 60px row, 4px in from the grey panel, under
 * the list's gliding white sheet. Numbers medium, labels regular, 14 over 12.
 */
/** Memoised: a bookmark or a hover elsewhere must not redraw every row's chart. */
const Line = memo(({ r, range, onToggle }: { r: Row; range: Span; onToggle: (ticker: string) => void }) => (
  <li data-row className="relative">
    <Link
      to={`/invest/${r.instrument.ticker}`}
      className={`relative grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Mark i={r.instrument} size={36} />
        <div className="min-w-0">
          <p className="flex h-3.5 min-w-0 items-center gap-[5px]">
            <span className="truncate font-medium text-ds-ink">{r.instrument.name}</span>
            {!r.instrument.featured && (
              <span
                className="shrink-0"
                title="Thin pool: about the largest order that stays inside the 1.5% price impact limit"
              >
                <StatusChip tone="warn">Up to {usdCompact(r.instrument.maxOrderUsd)}</StatusChip>
              </span>
            )}
            {r.owned && (
              <span className="inline-flex h-[17px] shrink-0 items-center rounded bg-ds-act-buy-bg px-1.5 text-[10px] leading-none text-ds-act-buy">
                Owned
              </span>
            )}
            {r.inBasket && (
              <span className="inline-flex h-[17px] shrink-0 items-center rounded bg-ds-panel px-1.5 text-[10px] leading-none text-ds-muted">
                In basket
              </span>
            )}
          </p>
          <p className="mt-[6px] truncate text-[12px] text-ds-muted">
            {r.instrument.ticker} · {r.instrument.sector}
          </p>
        </div>
      </div>

      <span className="text-right font-medium text-ds-ink">{r.fair === null ? "—" : usd(r.fair)}</span>

      <span className="flex -translate-y-px justify-end">
        <MoveChip value={r.change} light />
      </span>

      <span className="flex justify-end" aria-label={`${range} price chart`}>
        <span className="block h-10 w-[139px]">
          {r.spark && (
            <DotChart
              scale="price"
              series={points(r.spark, range)}
              label={range}
              axes={false}
              interactive={false}
              rest={LIST_DOT}
              {...TINY}
            />
          )}
        </span>
      </span>

      <span className="text-right text-ds-muted">{usdCompact(r.volume24h)}</span>
      <span className="text-right text-ds-muted">{compact(r.holders)}</span>
      <span />
    </Link>
    <button
      type="button"
      onClick={() => onToggle(r.instrument.ticker)}
      aria-pressed={r.saved}
      aria-label={r.saved ? `Remove ${r.instrument.name} from watchlist` : `Save ${r.instrument.name}`}
      title={r.saved ? "Remove from watchlist" : "Save to watchlist"}
      className={`absolute top-1/2 right-[5px] grid size-8 -translate-y-1/2 place-items-center rounded-lg transition-[background-color,color,transform] duration-150 hover:bg-black/[0.08] active:scale-90 ${
        r.saved ? "text-black" : "text-ds-muted hover:text-ds-ink"
      }`}
    >
      <BookmarkMark filled={r.saved} />
    </button>
  </li>
));
Line.displayName = "Line";

/**
 * Every instrument we can route, as a broker's list, to allstocks.svg: price,
 * the move and its shape over the chosen range, how much trades and how widely
 * it is held. Sortable on every figure, filterable by sector and name, twenty
 * to a page. Its range switch moves this table only.
 */
export const Screener = ({
  rows,
  range,
  onRange,
  query,
  onQuery,
  searching,
  loading,
  sectors,
  sector,
  onSector,
  onToggle,
}: {
  rows: readonly Row[];
  range: Span;
  onRange: (r: Span) => void;
  /** Typed here, searched on the server across every stock we support. */
  query: string;
  onQuery: (q: string) => void;
  /** True while a search is in flight, so an empty table is not mistaken for no results. */
  searching: boolean;
  loading: boolean;
  sectors: readonly string[];
  sector: string;
  onSector: (s: string) => void;
  onToggle: (ticker: string) => void;
}) => {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "volume", desc: true });
  const [page, setPage] = useState(0);
  const top = useRef<HTMLElement>(null);

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => sector === "All" || r.instrument.sector === sector)
    .filter(
      (r) =>
        !q || r.instrument.name.toLowerCase().includes(q) || r.instrument.ticker.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const x = VALUE[sort.key](a);
      const y = VALUE[sort.key](b);
      const d = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
      return sort.desc ? -d : d;
    });

  // A new filter or order starts from the top.
  useEffect(() => setPage(0), [sector, q, sort.key, sort.desc]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE, at * PAGE + PAGE);

  // A new page, or a sector picked from the rail, can leave the table much
  // shorter: once it has rendered, bring its top back into view if it has
  // scrolled up out of sight, under the sticky nav.
  const scrollUp = useRef(false);
  const turn = (p: number) => {
    scrollUp.current = true;
    setPage(p);
  };
  const lastSector = useRef(sector);
  if (lastSector.current !== sector) {
    lastSector.current = sector;
    scrollUp.current = true;
  }
  useEffect(() => {
    if (!scrollUp.current) return;
    scrollUp.current = false;
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  }, [page, sector]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  return (
    <section ref={top} aria-label="All stocks" className="min-w-0 scroll-mt-20 rounded-xl bg-white p-1">
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5 pt-4 text-[14px] leading-none">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="font-medium text-ds-ink">All Stocks</h2>
          <span className="truncate text-ds-muted">
            {loading
              ? ""
              : pages > 1
                ? // Paged, say which slice is on screen: "1–20 of 22".
                  `${at * PAGE + 1}–${at * PAGE + slice.length} of ${shown.length}${q ? " results" : ""}`
                : q
                  ? `${shown.length} ${shown.length === 1 ? "result" : "results"}`
                  : `${shown.length} of ${rows.length}`}
          </span>
          <InfoTip label="About this list" align="start">
            Showing the stocks deep enough for a normal order. Search finds any other tokenised stock with a
            market; thin ones show roughly the largest order they take. Prices, holders, volume and 24h moves
            are live. Charts are the underlying share&rsquo;s own history, re-levelled onto the token&rsquo;s
            live price &mdash; the two trade a little apart.
          </InfoTip>
        </div>
        <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
          <SearchField
            value={query}
            onChange={onQuery}
            placeholder="Search by company or ticker"
            label="Search stocks"
          />
          <RangeSwitch options={LIST_RANGES} value={range} onChange={onRange} />
        </div>
      </header>

      <FilterPills
        options={sectors.map((s) => ({ key: s, label: s }))}
        value={sector}
        onChange={onSector}
        label="Sector"
        className="mt-3 px-5"
      />

      <div className="mt-3 overflow-x-auto rounded-lg bg-ds-panel p-1">
        {loading || (searching && shown.length === 0) ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-ds-ink">
              {q ? `Nothing called “${query}”` : "Nothing in this sector"}
            </p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[12px] text-ds-muted">
              Only stocks with a pool someone can buy from are listed. A stock that is tokenised but has no
              market on Jupiter will not appear.
            </p>
          </div>
        ) : (
          <GlideTable
            columns={COLS}
            headings={
              <>
                <Head k="name" sort={sort} onSort={onSort} align="left">
                  Name
                </Head>
                <Head k="price" sort={sort} onSort={onSort}>
                  Price
                </Head>
                <Head k="change" sort={sort} onSort={onSort}>
                  {range}
                </Head>
                <span className="text-right">Chart</span>
                <Head k="volume" sort={sort} onSort={onSort}>
                  Volume 24H
                </Head>
                <Head k="holders" sort={sort} onSort={onSort}>
                  Holders
                </Head>
                <span />
              </>
            }
            footer={
              pages > 1 ? (
                <div className="pt-3 pb-[17px]">
                  <Pagination page={at} count={pages} onPage={turn} />
                </div>
              ) : undefined
            }
          >
            {slice.map((r) => (
              <Line key={r.instrument.ticker} r={r} range={range} onToggle={onToggle} />
            ))}
          </GlideTable>
        )}
      </div>
    </section>
  );
};
