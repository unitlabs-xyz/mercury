import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LiveDot, PriceError } from "./LiveStatus";
import { useWatchlist } from "./watchlist";
import { priceInstrument, usePrices, useUniverse, type Priced } from "../market/hooks";
import { performanceFor } from "../market/placeholder";
import type { Instrument } from "../market/universe";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Card,
  ChevronRight,
  Droplet,
  Grid,
  List,
  Pulse,
  Repeat,
  Search,
  Shield,
  Trend,
  Users,
} from "../ui/icons";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const compact = (v: number) =>
  !Number.isFinite(v) || v <= 0
    ? "—"
    : v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}m`
      : v >= 1_000
        ? `$${Math.round(v / 1_000)}k`
        : `$${Math.round(v)}`;

const count = (v: number) =>
  !Number.isFinite(v) || v <= 0
    ? "—"
    : v >= 1000
      ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`
      : String(Math.round(v));

/**
 * Broad means the instrument holds many companies; single stock means one. This
 * is what the thing *is*, not a forecast of how it will behave — we have no
 * volatility history to make a risk claim from.
 */
const BROAD = new Set(["SPY", "QQQ", "GLD"]);
const concentration = (ticker: string) => (BROAD.has(ticker) ? "Broad" : "Single stock");

const Move = ({ pct, className = "" }: { pct: number | null; className?: string }) => {
  if (pct === null) return <span className={`text-[13px] text-faint ${className}`}>—</span>;
  const up = pct >= 0;
  return (
    <span
      className={`flex shrink-0 items-center gap-[3px] rounded-md px-[7px] py-[3px] text-[12px] font-semibold tabular-nums ${
        up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"
      } ${className}`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
};

const Mark = ({ i, size = 34 }: { i: Instrument; size?: number }) =>
  i.logo ? (
    <img
      src={i.logo}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-chip text-[12px] font-bold text-ink-soft"
    >
      {i.ticker.slice(0, 2)}
    </span>
  );

/* ── ideal for getting started ──────────────────────────────────────── */

const StarterCard = ({
  p,
  saved,
  onToggle,
}: {
  p: Priced;
  saved: boolean;
  onToggle: () => void;
}) => {
  const perf = performanceFor(p.instrument.ticker);
  return (
    <article className="overflow-hidden rounded-2xl border border-cardline bg-white transition-shadow hover:shadow-[0_2px_14px_rgba(27,26,23,0.07)]">
      <p className="flex items-center gap-2 border-b border-brand-line bg-brand-tint px-4 py-2 text-[12px] text-brand-deep">
        <Users className="size-3.5 shrink-0" />
        {p.netBuyers24h > 0
          ? `${count(p.netBuyers24h)} more buyers than sellers in 24h`
          : `${count(perf.harborBuyers30d)} bought this in the last 30 days`}
      </p>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <Mark i={p.instrument} size={40} />
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${p.instrument.name} from watchlist` : `Save ${p.instrument.name}`}
            className={`-mt-1 -mr-1 grid size-9 place-items-center rounded-lg transition-colors ${
              saved ? "text-brand" : "text-faint hover:text-ink-soft"
            }`}
          >
            <Bookmark filled={saved} className="size-[18px]" />
          </button>
        </div>

        <Link to={`/invest/${p.instrument.ticker}`} className="mt-3 block">
          <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{p.instrument.name}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[1.5] text-muted">
            {p.instrument.about}
          </p>
        </Link>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-hair pt-3.5">
          <span>
            <span className="block text-[11px] tracking-[0.04em] text-faint uppercase">
              Min. amount
            </span>
            <span className="mt-0.5 block text-[15px] font-semibold tabular-nums">$5</span>
          </span>
          <span>
            <span className="block text-[11px] tracking-[0.04em] text-faint uppercase">5Y CAGR</span>
            <span className="mt-0.5 block text-[15px] font-semibold text-up-deep tabular-nums">
              {perf.cagr5y.toFixed(1)}%
            </span>
          </span>
          <span className="rounded-md bg-chip px-2 py-1 text-[12px] font-medium text-ink-soft">
            {concentration(p.instrument.ticker)}
          </span>
        </div>
      </div>
    </article>
  );
};

/* ── trending ───────────────────────────────────────────────────────── */

type Board = {
  key: string;
  title: string;
  sub: string;
  icon: ReactNode;
  rank: (a: Priced, b: Priced) => number;
  value: (p: Priced) => ReactNode;
};

const BOARDS: Board[] = [
  {
    key: "held",
    title: "Most held",
    sub: "Wallets holding the token",
    icon: <Users className="size-4" />,
    rank: (a, b) => b.holders - a.holders,
    value: (p) => <span className="tabular-nums">{count(p.holders)}</span>,
  },
  {
    key: "movers",
    title: "Biggest movers",
    sub: "Last 24 hours",
    icon: <Pulse className="size-4" />,
    rank: (a, b) => Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0),
    value: (p) => <Move pct={p.todayPct} />,
  },
  {
    key: "returns",
    title: "Best 1 year",
    sub: "Total return over twelve months",
    icon: <Trend className="size-4" />,
    rank: (a, b) => performanceFor(b.instrument.ticker).y1 - performanceFor(a.instrument.ticker).y1,
    value: (p) => <Move pct={performanceFor(p.instrument.ticker).y1} />,
  },
];

const BoardCard = ({ board, items }: { board: Board; items: Priced[] }) => (
  <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
      <span>
        <h3 className="text-[15px] font-semibold">{board.title}</h3>
        <p className="mt-1 text-[13px] text-muted">{board.sub}</p>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-deep">
        {board.icon}
      </span>
    </div>
    {items.length === 0 ? (
      <p className="border-t border-hair px-5 py-7 text-[13px] text-faint">
        Nothing in this filter.
      </p>
    ) : (
      <ol className="border-t border-hair">
        {items.map((p, n) => (
          <li key={p.instrument.ticker}>
            <Link
              to={`/invest/${p.instrument.ticker}`}
              className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-shell"
            >
              <span className="w-3.5 shrink-0 text-[13px] text-faint tabular-nums">{n + 1}</span>
              <Mark i={p.instrument} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">
                  {p.instrument.name}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-faint">
                  {p.instrument.ticker}
                </span>
              </span>
              <span className="flex shrink-0 justify-end text-[15px] font-semibold">
                {board.value(p)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    )}
  </section>
);

/* ── where else to go ───────────────────────────────────────────────── */

const TILES = [
  { icon: <Trend className="size-5" />, title: "Stocks", body: "Twenty, priced live", to: "/invest" },
  { icon: <Grid className="size-5" />, title: "Baskets", body: "Themed sets, one order", soon: true },
  { icon: <Repeat className="size-5" />, title: "Recurring", body: "Same amount weekly", soon: true },
  { icon: <Card className="size-5" />, title: "Cash", body: "Idle dollars earn 4.1%", to: "/money" },
  { icon: <List className="size-5" />, title: "Activity", body: "Orders and transfers", to: "/activity" },
  { icon: <Shield className="size-5" />, title: "Custody", body: "Keys stay yours", soon: true },
];

const Tile = ({ t }: { t: (typeof TILES)[number] }) => {
  const inner = (
    <>
      <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand-deep">
        {t.icon}
      </span>
      <span className="mt-3 flex items-center gap-1.5">
        <span className="text-[15px] font-semibold">{t.title}</span>
        {t.soon && (
          <span className="rounded bg-chip px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-faint uppercase">
            Soon
          </span>
        )}
      </span>
      <span className="mt-1 block text-[13px] leading-[1.45] text-muted">{t.body}</span>
    </>
  );
  return t.to ? (
    <Link
      to={t.to}
      className="flex flex-col rounded-2xl border border-cardline bg-white px-4 py-4 transition-colors hover:border-brand-soft hover:bg-white"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex flex-col rounded-2xl border border-cardline bg-white/60 px-4 py-4">{inner}</div>
  );
};

/* ── page ───────────────────────────────────────────────────────────── */

const STARTERS = ["SPY", "QQQ", "GLD"];

const SkeletonCard = () => (
  <div className="rounded-2xl border border-cardline bg-white px-5 py-5">
    <span className="block size-10 rounded-full bg-chip" />
    <span className="mt-3 block h-4 w-32 rounded bg-chip" />
    <span className="mt-2 block h-3 w-full rounded bg-shell" />
    <span className="mt-4 block h-10 w-full rounded bg-shell" />
  </div>
);

export const Invest = () => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const watchlist = useWatchlist();

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

  const sectors = useMemo(
    () => ["All", ...new Set(priced.map((p) => p.instrument.sector))].sort(),
    [priced],
  );
  const inFilter = filter === "All" ? priced : priced.filter((p) => p.instrument.sector === filter);

  const starters = STARTERS.map((t) => priced.find((p) => p.instrument.ticker === t)).filter(
    (p): p is Priced => !!p,
  );
  const saved = priced.filter((p) => watchlist.has(p.instrument.ticker));

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
      ) : q.length > 0 ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-cardline bg-white">
          {results.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[16px] font-semibold">Nothing called “{query}”</p>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] leading-[1.55] text-muted">
                Only instruments Harbor can actually route are listed. If a stock is tokenised but
                has no usable route, it will not appear here.
              </p>
            </div>
          ) : (
            results.map((p) => (
              <Link
                key={p.instrument.ticker}
                to={`/invest/${p.instrument.ticker}`}
                className="flex items-center gap-3.5 border-b border-hair px-5 py-3.5 transition-colors last:border-b-0 hover:bg-shell sm:px-6"
              >
                <Mark i={p.instrument} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {p.instrument.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[12px] text-faint">
                    {p.instrument.ticker}
                  </span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums">
                  {p.fair === null ? "—" : usd(p.fair)}
                </span>
                <Move pct={p.todayPct} />
              </Link>
            ))
          )}
        </section>
      ) : (
        <>
          {saved.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Saved</h2>
              <p className="mt-1 text-[14px] text-muted">
                Kept on this device, not in your account
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {saved.map((p) => (
                  <div
                    key={p.instrument.ticker}
                    className="flex items-center gap-3 rounded-2xl border border-cardline bg-white px-4 py-3"
                  >
                    <Mark i={p.instrument} size={30} />
                    <Link to={`/invest/${p.instrument.ticker}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {p.instrument.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] tabular-nums text-muted">
                        {p.fair === null ? "—" : usd(p.fair)}
                      </span>
                    </Link>
                    <Move pct={p.todayPct} />
                    <button
                      type="button"
                      onClick={() => watchlist.toggle(p.instrument.ticker)}
                      aria-label={`Remove ${p.instrument.name} from saved`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-brand transition-colors hover:bg-shell"
                    >
                      <Bookmark filled className="size-[17px]" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.015em]">
                  Ideal for getting started
                </h2>
                <p className="mt-1 text-[14px] text-muted">
                  Hundreds of companies in one holding, and the deepest liquidity we can route
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {universe.isLoading
                ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
                : starters.map((p) => (
                    <StarterCard
                      key={p.instrument.ticker}
                      p={p}
                      saved={watchlist.has(p.instrument.ticker)}
                      onToggle={() => watchlist.toggle(p.instrument.ticker)}
                    />
                  ))}
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Trending</h2>
            <p className="mt-1 text-[14px] text-muted">
              Ranked on what is actually happening on chain, not on what we promote
            </p>
            <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sectors.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilter(s)}
                    aria-pressed={filter === s}
                    className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                      filter === s
                        ? "border-brand bg-brand-tint text-brand-deep"
                        : "border-cardline bg-white text-ink-soft hover:border-brand-soft"
                    }`}
                  >
                    {s}
                  </button>
                ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {universe.isLoading
                ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
                : BOARDS.map((b) => (
                    <BoardCard
                      key={b.key}
                      board={b}
                      items={[...inFilter].sort(b.rank).slice(0, 5)}
                    />
                  ))}
            </div>
            <p className="mt-4 text-[12px] leading-[1.5] text-faint">
              Holders, volume and 24h moves are read live from chain. Return figures and 30-day buyer
              counts are sample data until the returns service ships.
            </p>
          </section>

          <section className="mt-14 mb-2">
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Everything else</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {TILES.map((t) => (
                <Tile key={t.title} t={t} />
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
};
