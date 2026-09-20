import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LiveDot, PriceError } from "./LiveStatus";
import { priceInstrument, usePrices, useUniverse, type Priced } from "../market/hooks";
import type { Instrument } from "../market/universe";
import { ArrowDown, ArrowUp, Search } from "../ui/icons";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const Move = ({ pct }: { pct: number | null }) => {
  if (pct === null) return <span className="w-[68px] text-right text-[13px] text-faint">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={`flex shrink-0 items-center gap-[3px] rounded-md px-[7px] py-[3px] text-[12px] font-semibold tabular-nums ${
        up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"
      }`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
};

const Mark = ({ i }: { i: Instrument }) =>
  i.logo ? (
    <img src={i.logo} alt="" width={34} height={34} className="size-[34px] shrink-0 rounded-full" />
  ) : (
    <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-chip text-[12px] font-bold text-ink-soft">
      {i.ticker.slice(0, 2)}
    </span>
  );

const Row = ({ p }: { p: Priced }) => (
  <Link
    to={`/invest/${p.instrument.ticker}`}
    className="flex items-center gap-3.5 border-b border-hair px-5 py-3.5 transition-colors last:border-b-0 hover:bg-shell sm:px-6"
  >
    <Mark i={p.instrument} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-semibold">{p.instrument.name}</span>
      <span className="mt-0.5 block font-mono text-[12px] text-faint">{p.instrument.ticker}</span>
    </span>
    <span className="text-[15px] font-semibold tabular-nums">
      {p.fair === null ? <span className="text-faint">—</span> : usd(p.fair)}
    </span>
    <Move pct={p.todayPct} />
  </Link>
);

const Shelf = ({ title, note, items }: { title: string; note?: string; items: Priced[] }) =>
  items.length === 0 ? null : (
    <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hair px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {note && <span className="text-[13px] text-faint">{note}</span>}
      </div>
      {items.map((p) => (
        <Row key={p.instrument.ticker} p={p} />
      ))}
    </section>
  );

const SkeletonShelf = () => (
  <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
    <div className="border-b border-hair px-5 py-4 sm:px-6">
      <span className="block h-4 w-28 rounded bg-chip" />
    </div>
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-3.5 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6">
        <span className="size-[34px] shrink-0 rounded-full bg-chip" />
        <span className="flex-1">
          <span className="block h-3.5 w-32 rounded bg-chip" />
          <span className="mt-2 block h-3 w-12 rounded bg-shell" />
        </span>
        <span className="h-4 w-16 rounded bg-chip" />
      </div>
    ))}
  </section>
);

const POPULAR = ["NVDA", "SPY", "QQQ", "TSLA", "AAPL", "MSTR"];

export const Invest = () => {
  const [query, setQuery] = useState("");
  const universe = useUniverse();
  const mints = useMemo(
    () => (universe.data ?? []).flatMap((i) => i.wrappers.map((w) => w.mint)),
    [universe.data],
  );
  const prices = usePrices(mints);

  const priced = useMemo(
    () => (universe.data ?? []).map((i) => priceInstrument(i, prices.data)),
    [universe.data, prices.data],
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q.length === 0
        ? []
        : priced.filter(
            (p) =>
              p.instrument.name.toLowerCase().includes(q) ||
              p.instrument.ticker.toLowerCase().includes(q),
          ),
    [priced, q],
  );

  const popular = POPULAR.map((t) => priced.find((p) => p.instrument.ticker === t)).filter(
    (p): p is Priced => !!p,
  );
  const movers = [...priced]
    .filter((p) => p.todayPct !== null)
    .sort((a, b) => Math.abs(b.todayPct!) - Math.abs(a.todayPct!))
    .slice(0, 6);
  const sectors = [...new Set(priced.map((p) => p.instrument.sector))].sort();

  return (
    <AppShell
      current="invest"
      title="Invest"
      aside={
        universe.data ? (
          <span className="text-[13px] text-muted">{universe.data.length} stocks and funds</span>
        ) : undefined
      }
      actions={<LiveDot fetching={prices.isFetching} at={prices.dataUpdatedAt} />}
    >
      <label className="mt-6 flex items-center gap-2.5 rounded-xl border border-cardline bg-white px-4 py-3 focus-within:border-brand">
        <Search className="size-[18px] shrink-0 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by company or ticker"
          aria-label="Search stocks"
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
      </label>

      {universe.isError ? (
        <PriceError
          className="mt-5"
          onRetry={() => void universe.refetch()}
          message="Could not reach Jupiter to load the stock list."
        />
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2 xl:items-start">
          {universe.isLoading ? (
            <>
              <SkeletonShelf />
              <SkeletonShelf />
            </>
          ) : q.length > 0 ? (
            results.length > 0 ? (
              <Shelf
                title="Results"
                note={results.length === 1 ? "1 match" : `${results.length} matches`}
                items={results}
              />
            ) : (
              <section className="rounded-2xl border border-cardline bg-white px-6 py-10 text-center">
                <p className="text-[16px] font-semibold">Nothing called “{query}”</p>
                <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] leading-[1.55] text-muted">
                  Only instruments Harbor can actually route are listed. If a stock is tokenised but
                  has no usable route, it will not appear here.
                </p>
              </section>
            )
          ) : (
            <>
              <Shelf title="Popular" note="What people search for" items={popular} />
              <Shelf title="Biggest movers" note="Last 24 hours" items={movers} />
              {sectors.map((s) => (
                <Shelf
                  key={s}
                  title={s}
                  items={priced.filter((p) => p.instrument.sector === s)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
};
