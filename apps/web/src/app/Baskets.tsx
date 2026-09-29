import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBaskets } from "../api/baskets";
import { RANGES, type Span } from "../market/hooks";
import { GlideRows, InfoTip, MoveChip, RailCard, RailHead, RangeSwitch, StatusChip } from "../ui/ds";
import { AppShell } from "./AppShell";
import { BasketLine, Stack } from "./baskets/parts";
import { feeLabel, useValued, type Valued } from "./baskets/model";
import { DotChart, TINY } from "./DotChart";
import { usd } from "./format";
import { RailList } from "./invest/Rail";
import { LIST_DOT, points } from "./invest/shared";
import { LiveStatusChip } from "./LiveStatus";
import { Skeleton } from "./portfolio/ui";

/**
 * Set like All Stocks: the name takes what is left, then value, the move, its
 * chart, what it costs to get in and out, and the minimum, right-aligned.
 */
const COLS = "grid-cols-[minmax(0,1fr)_100px_116px_188px_120px_88px]";

/** What each fee column says: nothing, one way, or both. */
const fees = (v: Valued) => {
  const d = v.basket.depositFeeBps ?? v.basket.feeBps;
  const w = v.basket.withdrawFeeBps ?? 0;
  if (!d && !w) return "None";
  return [d ? `${feeLabel(d)} in` : "", w ? `${feeLabel(w)} out` : ""].filter(Boolean).join(" · ");
};

/** One basket, to the All Stocks row: 60px, the stack of its heaviest stocks, and its figures. */
const Line = memo(({ v, range }: { v: Valued; range: Span }) => (
  <li data-row className="relative">
    <Link
      to={`/baskets/${v.basket.slug}`}
      className={`relative grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Stack legs={v.legs} size={32} />
        <div className="min-w-0">
          <p className="flex h-3.5 min-w-0 items-center gap-[5px]">
            <span className="truncate font-medium text-ds-ink">{v.basket.name}</span>
            {v.basket.position && (
              <span className="shrink-0">
                <StatusChip tone="owned">Owned</StatusChip>
              </span>
            )}
          </p>
          <p className="mt-[6px] truncate text-[12px] text-ds-muted">
            {v.basket.constituents.length} stocks ·{" "}
            {v.legs
              .slice()
              .sort((a, b) => b.target - a.target)
              .slice(0, 3)
              .map((l) => l.ticker)
              .join(", ")}
            {v.legs.length > 3 ? "…" : ""}
          </p>
        </div>
      </div>

      <span className="text-right font-medium text-ds-ink">{usd(v.nav)}</span>
      <span className="flex -translate-y-px justify-end">
        <MoveChip value={v.change} light />
      </span>
      <span className="flex justify-end" aria-label={`${range} value chart`}>
        <span className="block h-10 w-[139px]">
          {v.series && (
            <DotChart
              scale="price"
              series={points(v.series, range)}
              label={range}
              axes={false}
              interactive={false}
              rest={LIST_DOT}
              {...TINY}
            />
          )}
        </span>
      </span>
      <span className="truncate text-right text-ds-muted">{fees(v)}</span>
      <span className="text-right text-ds-muted">{usd(v.basket.minimumUsd, 0)}</span>
    </Link>
  </li>
));
Line.displayName = "Line";

/** The three things to know before the first one, as numbered lines. */
const HOW: [string, string][] = [
  ["One amount buys every stock", "Split by the basket's weights, in one order."],
  ["You hold one token", "It tracks everything inside. Send it, or sell it back whenever."],
  ["Held in a Symmetry vault", "Not by us. You can withdraw on Symmetry without Mercury."],
];

/**
 * Every basket on one screen, laid out like Invest: the list with its values
 * and charts over the chosen range, and the rail for what you hold and how
 * baskets work. The rail always reads today.
 */
export const Baskets = () => {
  const [range, setRange] = useState<Span>("1M");
  const baskets = useBaskets();
  const list = useValued(baskets.data, range);
  const today = useValued(baskets.data, "1D");

  const owned = useMemo(() => today.valued.filter((v) => v.basket.position), [today.valued]);
  const loading = baskets.isLoading || list.loading;

  return (
    <AppShell current="baskets" title="Baskets" quiet>
      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
        <section aria-label="All baskets" className="min-w-0 rounded-xl bg-white p-1">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 text-[14px] leading-none">
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="font-medium text-ds-ink">Baskets</h2>
              <span className="truncate text-ds-muted">
                {loading ? "" : `${baskets.data?.length ?? 0} on Symmetry`}
              </span>
              <InfoTip label="About these baskets" align="start">
                Each basket is a Symmetry vault holding tokenised stocks at set weights. Its token started at
                $1.00; the value is what the stocks inside are worth now, from their live prices and the
                underlying shares&rsquo; own history. Weights are not rebalanced, so they drift.
              </InfoTip>
            </div>
            <div className="flex items-center gap-2">
              <LiveStatusChip fetching={list.fetching} at={list.at} />
              <RangeSwitch options={RANGES} value={range} onChange={setRange} />
            </div>
          </header>

          <div className="mt-3 overflow-x-auto rounded-lg bg-ds-panel p-1">
            {loading ? (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-20 rounded-full" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="ml-auto h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : list.valued.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-[14px] font-medium text-ds-ink">No baskets yet</p>
                <p className="mx-auto mt-2 max-w-[44ch] text-[12px] text-ds-muted">
                  Baskets appear here once their vault is live on Symmetry.
                </p>
              </div>
            ) : (
              <div className="min-w-[860px]">
                <div
                  className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}
                >
                  <span>Name</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">{range}</span>
                  <span className="text-right">Chart</span>
                  <span className="text-right">Fees</span>
                  <span className="text-right">Minimum</span>
                </div>
                <GlideRows as="ul">
                  {list.valued.map((v) => (
                    <Line key={v.basket.slug} v={v} range={range} />
                  ))}
                </GlideRows>
              </div>
            )}
          </div>
        </section>

        <aside className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-1">
          <RailList label="Your baskets" meta="Today">
            {today.loading || baskets.isLoading ? (
              <div className="flex flex-col gap-3 p-3">
                <Skeleton className="h-9 w-full" />
              </div>
            ) : owned.length === 0 ? (
              <p className="flex h-[52px] items-center px-3 text-[14px] text-ds-muted">
                The baskets you buy show up here.
              </p>
            ) : (
              <GlideRows as="ul">
                {owned.map((v) => (
                  <li key={v.basket.slug}>
                    <BasketLine
                      v={v}
                      figure={v.nav === null ? null : v.nav * v.basket.position!.tokens}
                      sub={`${v.basket.position!.tokens.toFixed(2)} ${v.basket.vault?.symbol ?? "tokens"}`}
                    />
                  </li>
                ))}
              </GlideRows>
            )}
          </RailList>

          <RailCard label="How baskets work">
            <RailHead title="How baskets work" />
            <ol className="mt-[15px] flex flex-col gap-4">
              {HOW.map(([title, body], k) => (
                <li key={title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-[13px]">
                  <span className="grid size-6 place-items-center rounded-full bg-ds-panel text-[12px] leading-none font-medium text-ds-ink">
                    {k + 1}
                  </span>
                  <span className="min-w-0 pt-[5px]">
                    <span className="block text-[14px] leading-none font-medium text-ds-ink">{title}</span>
                    <span className="mt-1.5 block text-[14px] leading-[1.45] text-ds-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </RailCard>
        </aside>
      </div>
    </AppShell>
  );
};
