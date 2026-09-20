import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";
import { INSTRUMENTS, SECTORS, type Instrument } from "./market";
import { ArrowDown, ArrowUp, Search } from "../ui/icons";

const Move = ({ pct }: { pct: number }) => {
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

const Row = ({ i }: { i: Instrument }) => (
  <Link
    to={`/invest/${i.ticker}`}
    className="flex items-center gap-3.5 border-b border-hair px-5 py-3.5 transition-colors last:border-b-0 hover:bg-shell sm:px-6"
  >
    <Mark i={i} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-semibold">{i.name}</span>
      <span className="mt-0.5 block font-mono text-[12px] text-faint">{i.ticker}</span>
    </span>
    <span className="text-[15px] font-semibold tabular-nums">
      ${i.fair.toLocaleString("en-US", { minimumFractionDigits: 2 })}
    </span>
    <Move pct={i.todayPct} />
  </Link>
);

const Shelf = ({ title, note, items }: { title: string; note?: string; items: Instrument[] }) => (
  <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hair px-5 py-4 sm:px-6">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {note && <span className="text-[13px] text-faint">{note}</span>}
    </div>
    {items.map((i) => (
      <Row key={i.ticker} i={i} />
    ))}
  </section>
);

export const Invest = () => {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return INSTRUMENTS.filter(
      (i) => i.name.toLowerCase().includes(q) || i.ticker.toLowerCase().includes(q),
    );
  }, [query]);

  const movers = useMemo(
    () => [...INSTRUMENTS].sort((a, b) => Math.abs(b.todayPct) - Math.abs(a.todayPct)).slice(0, 5),
    [],
  );

  return (
    <AppShell
      current="invest"
      title="Invest"
      aside={<span className="text-[13px] text-muted">{INSTRUMENTS.length} stocks and funds</span>}
    >
      <label className="mt-6 flex items-center gap-2.5 rounded-[10px] border border-cardline bg-white px-4 py-3 focus-within:border-brand">
        <Search className="size-[18px] shrink-0 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Search by company or ticker"
          aria-label="Search instruments"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
      </label>

      {results ? (
        results.length > 0 ? (
          <div className="mt-4">
            <Shelf title="Results" note={results.length === 1 ? "1 match" : `${results.length} matches`} items={results} />
          </div>
        ) : (
          <div className="mt-4 grid place-items-center rounded-2xl border border-cardline bg-white px-6 py-16 text-center">
            <p className="text-[16px] font-semibold">Nothing called “{query}”</p>
            <p className="mt-1.5 max-w-[42ch] text-[14px] leading-[1.5] text-muted text-pretty">
              Only instruments Harbor can actually route are listed. If a stock is tokenised but
              has no usable route, it will not appear here.
            </p>
          </div>
        )
      ) : (
        <div className="mt-4 grid gap-[18px] xl:grid-cols-2">
          <Shelf
            title="Popular"
            note="What people search for"
            items={INSTRUMENTS.filter((i) => i.measured)}
          />
          <Shelf title="Biggest movers" note="Today, up and down" items={movers} />
          {SECTORS.map((sector) => (
            <Shelf
              key={sector}
              title={sector}
              items={INSTRUMENTS.filter((i) => i.sector === sector)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
};
