import { useCallback, useEffect, useMemo, useState } from "react";
import { usePortfolio } from "../api/hooks";
import { priceInstrument, useInstrumentSearch, useUniverse } from "../market/hooks";
import { changeFor, historyFor, type Range } from "../market/placeholder";
import { AppShell } from "./AppShell";
import { Markets } from "./invest/Top";
import { MostBought, Movers, Sectors, Watchlist } from "./invest/Rail";
import { Screener } from "./invest/Screener";
import type { Row } from "./invest/shared";
import type { Instrument } from "../market/hooks";
import { LiveStatusChip, PriceError } from "./LiveStatus";
import { useWatchlist } from "./watchlist";

/** Broad holdings lead: for most people one of these is the right first buy. */
const INDEXES = ["SPY", "QQQ", "GLD"];

/**
 * The market on one screen, laid out like the portfolio: the broad indexes
 * across the top, every stock as a sortable list with its chart, and the rail
 * for what you follow, what is moving and what is being bought. Each range
 * switch drives only the panel it sits in; the rail always reads today.
 */
export const Invest = () => {
  const [marketRange, setMarketRange] = useState<Range>("1D");
  const [listRange, setListRange] = useState<Range>("1D");
  const [sector, setSector] = useState("All");
  const watchlist = useWatchlist();

  const [query, setQuery] = useState("");
  // Search the server once typing settles, not on every keystroke.
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // The featured shelf carries its own prices, so the page needs no second request.
  const universe = useUniverse();
  const search = useInstrumentSearch(term);
  const portfolio = usePortfolio();

  // Rows are built without the watchlist, then marked saved through a cache,
  // so a bookmark swaps only its own row's object: every other row keeps its
  // identity and skips re-rendering (and redrawing its dot chart).
  const build = useCallback(
    (range: Range, source: readonly Instrument[] | undefined): Row[] => {
      const owned = new Set(portfolio.data?.holdings.map((h) => h.ticker));
      return (source ?? []).map((i) => {
        const p = priceInstrument(i, undefined);
        return {
          ...p,
          change: changeFor(i.ticker, range, p.todayPct),
          spark: historyFor(i.ticker, range, p.fair, p.todayPct),
          owned: owned.has(i.ticker),
          saved: false,
        };
      });
    },
    [portfolio.data],
  );
  const savedCopy = useMemo(() => new WeakMap<Row, Row>(), []);
  const mark = useCallback(
    (rows: readonly Row[]): Row[] => {
      const kept = new Set(watchlist.tickers);
      return rows.map((r) => {
        if (!kept.has(r.instrument.ticker)) return r;
        let copy = savedCopy.get(r);
        if (!copy) {
          copy = { ...r, saved: true };
          savedCopy.set(r, copy);
        }
        return copy;
      });
    },
    [watchlist.tickers, savedCopy],
  );

  // A search replaces the shelf with every stock we support.
  const searching = term.length > 0;
  const listBase = useMemo(
    () => build(listRange, searching ? search.data : universe.data),
    [build, listRange, searching, search.data, universe.data],
  );
  const todayBase = useMemo(() => build("1D", universe.data), [build, universe.data]);
  const indexBase = useMemo(
    () =>
      build(marketRange, universe.data)
        .filter((r) => INDEXES.includes(r.instrument.ticker))
        .sort((a, b) => INDEXES.indexOf(a.instrument.ticker) - INDEXES.indexOf(b.instrument.ticker)),
    [build, marketRange, universe.data],
  );
  const list = useMemo(() => mark(listBase), [mark, listBase]);
  const today = useMemo(() => mark(todayBase), [mark, todayBase]);
  const indexes = useMemo(() => mark(indexBase), [mark, indexBase]);

  // Newest save first, so a bookmark lands at the top of the watchlist.
  const saved = useMemo(() => {
    const by = new Map(today.map((r) => [r.instrument.ticker, r]));
    return [...watchlist.tickers].reverse().flatMap((t) => by.get(t) ?? []);
  }, [today, watchlist.tickers]);

  const loading = universe.isLoading;
  const sectors = useMemo(
    () => [
      "All",
      // "Other" goes last, after the named sectors, as the design has it.
      ...[...new Set(list.map((r) => r.instrument.sector))].sort((a, b) =>
        a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
      ),
    ],
    [list],
  );

  return (
    <AppShell current="invest" title="Invest" quiet>
      {universe.isError ? (
        <PriceError
          onRetry={() => void universe.refetch()}
          message="Could not reach Jupiter to load the stock list."
        />
      ) : (
        <>
          <Markets
            indexes={indexes}
            loading={loading}
            range={marketRange}
            onRange={setMarketRange}
            onToggle={watchlist.toggle}
            live={<LiveStatusChip fetching={universe.isFetching} at={universe.dataUpdatedAt} />}
          />

          <div className="mt-4 grid items-start gap-4 md:mt-6 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
            <div className="flex min-w-0 flex-col gap-3">
              <Screener
                rows={list}
                range={listRange}
                onRange={setListRange}
                query={query}
                onQuery={setQuery}
                searching={searching && (search.isFetching || query.trim() !== term)}
                loading={loading}
                sectors={sectors}
                sector={sector}
                onSector={setSector}
                onToggle={watchlist.toggle}
              />
            </div>

            <aside className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-1">
              <Watchlist rows={saved} loading={loading} />
              <Movers rows={today} loading={loading} />
              <MostBought rows={today} loading={loading} />
              <Sectors rows={today} loading={loading} current={sector} onPick={setSector} />
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
};
