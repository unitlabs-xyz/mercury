import { memo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useReturns, type Span } from "../../market/hooks";
import { MoveChip, RangeSwitch } from "../../ui/ds";
import { DotChart, SMALL } from "../DotChart";
import { usd } from "@mercury/view";
import { Skeleton } from "../portfolio/ui";
import { Mark, compact, points, type Row } from "./shared";

/** The market header offers the three ranges the design shows. */
const MARKET_RANGES: Span[] = ["1D", "1W", "1M"];

/** The flow strip's icon: two people behind a third, as drawn in top3.svg. */
const People = () => (
  <svg viewBox="23.4 12.5 16 16" width={16} height={16} fill="none" aria-hidden className="shrink-0">
    <g stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round">
      <path d="M33.9 19.766a2.567 2.567 0 1 0-5.133 0 2.567 2.567 0 0 0 5.133 0Z" />
      <path d="M33.888 20.023a2.567 2.567 0 1 0-1.808-2.713" />
      <path d="M30.588 17.31a2.567 2.567 0 1 0-1.808 2.713" />
      <path d="M38.667 23.8c0-2.025-1.806-3.666-4.033-3.666" />
      <path d="M35.367 26c0-2.025-1.806-3.667-4.033-3.667-2.228 0-4.034 1.642-4.034 3.667" />
      <path d="M28.033 20.134C25.806 20.134 24 21.775 24 23.8" />
    </g>
  </svg>
);

/** The save mark from top3.svg: a 10 × 12 bookmark, filled once saved. */
const Save = ({ on }: { on: boolean }) => (
  <svg viewBox="427.9 63.5 10.6 13" width={10.6} height={13} aria-hidden className="shrink-0">
    <path
      d="M428.4 73.589v-4.964c0-2.18 0-3.27.703-3.948.703-.677 1.834-.677 4.097-.677s3.394 0 4.097.677c.703.678.703 1.768.703 3.948v4.964c0 1.383 0 2.075-.464 2.323-.898.479-2.582-1.121-3.382-1.603-.464-.279-.696-.419-.954-.419s-.49.14-.954.419c-.8.482-2.484 2.082-3.382 1.603-.464-.248-.464-.94-.464-2.323Z"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * One broad holding, to top3.svg: the flow strip 4px in, then the mark and save,
 * the name and what it is, the price with its move, the dot-matrix sparkline,
 * and the minimum, the five-year average and the kind along the foot.
 */
/** Memoised, like the list rows: a bookmark elsewhere must not redraw these charts. */
const IndexCard = memo(
  ({ r, range, onToggle }: { r: Row; range: Span; onToggle: (ticker: string) => void }) => {
    const returns = useReturns(r.instrument.ticker);
    const to = `/invest/${r.instrument.ticker}`;
    return (
      <article className="relative flex min-w-0 flex-col rounded-xl bg-white p-1">
        {/*
          Not "2.7K more buyers than sellers in 24h". That is a day's net flow,
          led with, in colour, as the first thing on the card — which is the
          thing ADR 0009 rules out: nothing that makes trading more often feel
          like progress. Key stats dropped the same figure for the same reason,
          and this card was still leading with it.

          How many people hold it says something a buyer can use, and says it
          about holding.
        */}
        <p className="flex h-8 items-center gap-2 rounded-lg bg-ds-flow-bg pl-5 text-[12px] leading-none text-ds-flow">
          <People />
          {`${compact(r.holders)} wallets hold this`}
        </p>

        <div className="flex flex-1 flex-col px-3 sm:px-5 pt-4 pb-4">
          {/* Only this block opens the stock: logo, name, description and price,
            one link with a grey sheet under the pointer. The buyers strip, the
            chart and the figures below are not links. The sheet reaches out to
            4px inside the card's edges and 4px under the strip, like every
            panel in a p-1 card; its padding puts the text back where it was. */}
          <div className="group relative -mx-5 -mt-3">
            <Link
              to={to}
              className="block rounded-lg px-5 pt-3 pb-4 transition-colors duration-150 group-hover:bg-ds-panel"
            >
              <div className="flex min-w-0 items-center gap-3 pr-8">
                <Mark i={r.instrument} size={36} />
                <h3 className="min-w-0 leading-none">
                  <span className="block truncate text-[14px] font-medium text-ds-ink">
                    {r.instrument.name}
                  </span>
                  <span className="mt-[6px] block truncate text-[12px] text-ds-muted">
                    {r.instrument.ticker} · {r.instrument.sector}
                  </span>
                </h3>
              </div>

              <p className="mt-[13px] line-clamp-2 h-9 text-[12px] leading-[18px] text-ds-muted">
                {r.instrument.about}
              </p>

              {/* Price, move chip and range on one centre line. */}
              <div className="mt-[13px] flex items-center">
                <p className="text-[28px] leading-none font-medium text-ds-ink">
                  {r.fair === null ? "—" : usd(r.fair)}
                </p>
                {/* Up 1px: the figures' ink sits a touch above their line box's middle. */}
                <span className="ml-2.5 flex -translate-y-px">
                  <MoveChip value={r.change} soft />
                </span>
                <span className="ml-2 -translate-y-px text-[12px] leading-none text-ds-muted opacity-80">
                  {range}
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => onToggle(r.instrument.ticker)}
              aria-pressed={r.saved}
              aria-label={
                r.saved ? `Remove ${r.instrument.name} from watchlist` : `Save ${r.instrument.name}`
              }
              title={r.saved ? "Remove from watchlist" : "Save to watchlist"}
              className={`absolute top-[14px] right-2 grid size-8 place-items-center rounded-lg transition-[background-color,color,transform] duration-150 hover:bg-black/[0.06] active:scale-90 ${
                r.saved ? "text-ds-ink" : "text-ds-muted hover:text-ds-ink"
              }`}
            >
              <Save on={r.saved} />
            </button>
          </div>

          <div className="mt-[3px] h-[60px]">
            {r.spark ? (
              <DotChart series={points(r.spark, range)} label={range} axes={false} scale="price" {...SMALL} />
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>

          <dl className="mt-[13px] grid grid-cols-[181px_minmax(0,1fr)_auto] items-end">
            <div className="pb-0.5">
              <dt className="text-[14px] leading-none text-ds-muted">Min. amount</dt>
              <dd className="mt-[9px] text-[20px] leading-none font-medium text-ds-ink">$5</dd>
            </div>
            <div className="pb-0.5">
              <dt className="text-[14px] leading-none text-ds-muted">5Y average</dt>
              {/* A dash while it loads and a dash if there is none: a 0.0% would
                  read as a company that went nowhere for five years. */}
              <dd className="mt-[9px] text-[20px] leading-none font-medium text-ds-up">
                {returns.data?.cagr5y == null ? "—" : `${returns.data.cagr5y.toFixed(1)}%`}
              </dd>
            </div>
            <dd className="flex h-7 items-center rounded-lg bg-ds-panel px-[17px] text-[16px] leading-none text-ds-muted">
              <span className="opacity-80">Broad</span>
            </dd>
          </dl>
        </div>
      </article>
    );
  },
);
IndexCard.displayName = "IndexCard";

/**
 * The broad indexes, three cards under one heading. The range switch sits on
 * the heading, outside the cards, so it reads as belonging to these three and
 * nothing below them.
 */
export const Markets = ({
  indexes,
  loading,
  range,
  onRange,
  onToggle,
  live,
}: {
  indexes: readonly Row[];
  loading: boolean;
  range: Span;
  onRange: (r: Span) => void;
  onToggle: (ticker: string) => void;
  live: ReactNode;
}) => (
  <section aria-label="Markets">
    {/* To investmarket.svg: the title at 14px medium, the live chip 10px after it, the range switch right. */}
    <header className="flex h-8 items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[20px] leading-none font-medium text-ds-ink">Markets</h2>
        {live}
      </div>
      <RangeSwitch options={MARKET_RANGES} value={range} onChange={onRange} />
    </header>
    <div className="h-3" />
    <div className="grid gap-4 sm:grid-cols-3 md:gap-6">
      {loading
        ? [0, 1, 2].map((i) => (
            <div key={i} className="flex h-[358px] flex-col gap-3 rounded-xl bg-white p-4 sm:p-6">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[60px] w-full" />
            </div>
          ))
        : indexes.map((r) => <IndexCard key={r.instrument.ticker} r={r} range={range} onToggle={onToggle} />)}
    </div>
  </section>
);
