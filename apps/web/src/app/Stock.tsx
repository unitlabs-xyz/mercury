import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePortfolio } from "../api/hooks";
import {
  priceInstrument,
  RANGES,
  useDecision,
  useHistories,
  useHistory,
  useInstrument,
  usePrices,
  useUniverse,
  type Span,
} from "../market/hooks";

import { ButtonLink } from "../ui/Button";
import { BookmarkMark, Chevron, GlideRows, MoveChip, RangeSwitch, StatusChip } from "../ui/ds";
import { Clock } from "../ui/icons";
import { AppShell } from "./AppShell";
import { OrderSheet } from "./OrderSheet";
import { DotChart } from "./DotChart";
import { usd, usdCompact, usdSigned } from "@mercury/view";
import { RailList, Saved } from "./invest/Rail";
import { Mark, points, type Row } from "./invest/shared";
import { LiveStatusChip, PriceError } from "./LiveStatus";
import { Skeleton } from "./portfolio/ui";
import { About, Position, Stats } from "./stock/Panels";
import { BorrowPanel } from "./stock/BorrowPanel";
import { InBaskets } from "./stock/InBaskets";
import { useHeldAs } from "./stock/heldAs";
import { localTime } from "../ui/localTime";
import { Routes } from "./stock/Routes";
import { Ticket } from "./stock/Ticket";
import { useWatchlist } from "./watchlist";

const SINCE: Record<Span, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "6M": "past six months",
  "1Y": "past year",
  "5Y": "past five years",
};

const Missing = ({ loading }: { loading: boolean }) => (
  <AppShell current="invest" title="Invest" quiet>
    <section className="rounded-xl bg-white px-6 py-12 text-center">
      {loading ? (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      ) : (
        <>
          <p className="text-[14px] leading-none font-medium text-ds-ink">We don't have that one</p>
          <p className="mt-3 text-[14px] text-ds-muted">
            No verified tokenised version of that ticker exists yet.
          </p>
          <ButtonLink to="/invest" variant="primary" className="mt-5">
            Back to Invest
          </ButtonLink>
        </>
      )}
    </section>
  </AppShell>
);

/**
 * One stock, laid out like a broker's page and like the rest of the app: the
 * chart and price lead, the figures a buyer checks sit under it, then where the
 * order would go and what the thing is. The rail holds the order itself, what
 * you already own, and similar stocks. The order amount drives the live route,
 * so the table and the ticket always quote the same number.
 */
export const Stock = () => {
  const { ticker = "" } = useParams();
  const [range, setRange] = useState<Span>("1D");
  const [raw, setRaw] = useState("100");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [max, setMax] = useState(false);
  const [buying, setBuying] = useState(false);
  const watchlist = useWatchlist();

  // Any listed stock opens, featured or found by search; the rail reads the featured shelf.
  const one = useInstrument(ticker);
  const universe = useUniverse();
  const portfolio = usePortfolio();
  const instrument = useMemo(() => one.data ?? undefined, [one.data]);
  // The position by issuer: one stock to the reader, but only its xStocks part can back a loan.
  const heldAs = useHeldAs(instrument?.ticker ?? ticker.toUpperCase());

  // Live prices for this stock's own tokens: the decision needs each multiplier and quote time.
  const mints = useMemo(() => instrument?.wrappers.map((w) => w.mint) ?? [], [instrument]);
  const prices = usePrices(mints);
  const priced = instrument ? priceInstrument(instrument, prices.data) : null;

  // Quote once the typing settles, not on every keystroke.
  const amount = Number(raw) || 0;
  const [settled, setSettled] = useState(amount);
  useEffect(() => {
    const t = setTimeout(() => setSettled(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);
  /* A new stock is a new question. Landing on the Sell tab of something you
     do not own would show a tab that should not exist for you. */
  useEffect(() => {
    setSide("buy");
    setMax(false);
  }, [ticker]);

  const [acceptImpact, setAcceptImpact] = useState(false);
  /* A different size is a different cost, so it has to be accepted again. */
  useEffect(() => setAcceptImpact(false), [settled, side, max]);
  const { decision, isLoading, isFetching, session, proceeds } = useDecision(
    instrument,
    Math.max(settled, 1),
    prices.data,
    { side, max, acceptImpact },
  );

  // Already anchored server-side onto the live share price, so the line ends
  // where the figure above it says it should.
  const history = useHistory(instrument?.ticker ?? "", range);
  const series = useMemo(() => history.data?.points.map((p) => p.price) ?? null, [history.data]);
  const chart = useMemo(() => (series ? points(series, range) : null), [series, range]);
  // A pinch on the chart steps the range: out for more time, in for less.
  const zoom = useCallback(
    (dir: 1 | -1) =>
      setRange((r: Span) => RANGES[Math.min(RANGES.length - 1, Math.max(0, RANGES.indexOf(r) + dir))]!),
    [],
  );

  // Chosen above the early return, because their sparklines need a hook.
  const similarTickers = (universe.data ?? [])
    .filter((i) => i.ticker !== instrument?.ticker && i.sector === instrument?.sector)
    .concat(
      (universe.data ?? []).filter((i) => i.ticker !== instrument?.ticker && i.sector !== instrument?.sector),
    )
    .slice(0, 4);
  const similarHistory = useHistories(
    similarTickers.map((i) => i.ticker),
    "1D",
  );

  if (!instrument || !priced) return <Missing loading={one.isLoading} />;

  const t = instrument.ticker;
  // Over a day the live 24h move is the better number: it is what the price
  // beside it is quoted against, and these trade around the clock.
  const change = range === "1D" ? (priced.todayPct ?? 0) : (history.data?.changePct ?? 0);
  const changeUsd = priced.fair === null ? null : priced.fair - priced.fair / (1 + change / 100);
  const up = change >= 0;
  const saved = watchlist.has(t);
  const holding = portfolio.data?.holdings.find((h) => h.ticker === t);
  const basketValue =
    portfolio.data?.baskets.reduce(
      (total, basket) =>
        total +
        basket.holdings.reduce((sum, asset) => sum + (asset.ticker === t ? Number(asset.valueUsd) : 0), 0),
      0,
    ) ?? 0;
  const cash = portfolio.data ? Number(portfolio.data.cashUsd) : null;
  const shares = holding ? Number(holding.shares) : null;
  const pledged = holding?.pledgedShares === undefined ? null : Number(holding.pledgedShares);
  /* The books count pledged stock as owned, and they are right to. The wallet
     still cannot spend it, so it is not what can be sold. */
  const sellableShares = shares === null ? null : shares - (pledged ?? 0);
  const positionUsd = holding ? Number(holding.valueUsd) : null;
  /* Value scales with shares, so the sellable value is the sellable share of
     it. Offering the whole position would promise an exit Kamino is holding. */
  const sellableUsd =
    positionUsd === null || shares === null || shares <= 0
      ? null
      : Number(((positionUsd * (sellableShares ?? 0)) / shares).toFixed(2));
  const owned = new Set(portfolio.data?.holdings.map((h) => h.ticker));
  const inBasket = new Set(
    portfolio.data?.baskets.flatMap((basket) =>
      basket.holdings.flatMap((asset) => (asset.ticker && Number(asset.valueUsd) > 0 ? [asset.ticker] : [])),
    ),
  );

  const similar: Row[] = similarTickers.map((i) => {
    const p = priceInstrument(i, undefined);
    const h = similarHistory.data?.get(i.ticker) ?? null;
    return {
      ...p,
      change: p.todayPct ?? 0,
      spark: h === null ? null : h.points.map((pt) => pt.price),
      owned: owned.has(i.ticker),
      inBasket: inBasket.has(i.ticker),
      saved: watchlist.has(i.ticker),
    };
  });

  /** "Monday at 7:00 PM IST": when the market opens, in the reader's own zone. */
  const opensAt = session?.nextOpen
    ? localTime(session.nextOpen, { weekday: "long" }).replace(/^(\w+), /, "$1 at ")
    : undefined;

  return (
    <AppShell current="invest" title={instrument.name} quiet>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center justify-between gap-3 md:mb-6">
        <p className="flex items-center gap-2 text-[14px] leading-none text-ds-muted">
          <Link to="/invest" className="transition-colors hover:text-ds-ink">
            Invest
          </Link>
          <Chevron />
          <span className="text-ds-ink">{instrument.name}</span>
        </p>
        <LiveStatusChip fetching={prices.isFetching} at={prices.dataUpdatedAt} />
      </nav>

      {/* Two columns on wide screens. Narrower, both columns dissolve (`contents`)
          and the cards take one order: the chart, then the order ticket, then the
          detail panels, then Similar and baskets — buying never sits at the foot. */}
      <div className="flex flex-col gap-4 md:gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_416px] xl:items-start">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
          {/* The price and its chart, set like the market cards and the performance card. */}
          <section
            aria-label="Price"
            className="order-1 flex min-w-0 flex-col rounded-xl bg-white p-1 xl:order-none"
          >
            <div className="px-5 pt-5 pb-5">
              <div className="flex items-center justify-between gap-3">
                {/* The page's subject, larger than a card's: a 48px logo, the name at 20
                    with its chips beside it, and ticker and sector under it at 14. */}
                <div className="flex min-w-0 items-center gap-4">
                  <Mark i={instrument} size={48} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <h1 className="truncate text-[20px] leading-none font-medium text-ds-ink">
                        {instrument.name}
                      </h1>
                      {/* The token count was here too. "Where your order goes"
                          lists them by name and issuer, and About names them
                          again below that — a header badge saying how many
                          there are added a third telling and no new fact. */}
                      <span className="flex flex-wrap items-center gap-[5px]">
                        {!instrument.featured && (
                          <span title="About the largest order that stays inside the 1.5% price impact limit">
                            <StatusChip tone="warn" size="md">
                              Up to {usdCompact(instrument.maxOrderUsd)} an order
                            </StatusChip>
                          </span>
                        )}
                        {holding && (
                          <StatusChip tone="owned" size="md">
                            Owned
                          </StatusChip>
                        )}
                        {basketValue > 0 && (
                          <StatusChip tone="neutral" size="md">
                            In basket
                          </StatusChip>
                        )}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-[14px] leading-none text-ds-muted">
                      {t} · {instrument.sector}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => watchlist.toggle(t)}
                  aria-pressed={saved}
                  aria-label={saved ? `Remove ${instrument.name} from watchlist` : `Save ${instrument.name}`}
                  title={saved ? "Remove from watchlist" : "Save to watchlist"}
                  className={`-mr-2 grid size-8 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform] duration-150 hover:bg-black/[0.06] active:scale-90 ${
                    saved ? "text-black" : "text-ds-muted hover:text-ds-ink"
                  }`}
                >
                  <BookmarkMark filled={saved} />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  {priced.fair === null ? (
                    <Skeleton className="h-9 w-44" />
                  ) : (
                    <p className="text-[36px] leading-none font-medium text-ds-ink">{usd(priced.fair)}</p>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-none">
                    <MoveChip value={change} light />
                    <span className={up ? "text-ds-up" : "text-ds-fall-light"}>{usdSigned(changeUsd)}</span>
                    <span className="text-ds-ink/80">{SINCE[range]}</span>
                  </p>
                </div>
                <RangeSwitch options={RANGES} value={range} onChange={setRange} />
              </div>

              <div className="mt-[14px] flex h-[340px]">
                {chart ? (
                  <DotChart series={chart} label={SINCE[range]} scale="price" onZoom={zoom} />
                ) : (
                  <Skeleton className="h-full w-full" />
                )}
              </div>
            </div>

            {/* The state first and what it means for you second, because the two
                are not equally urgent. Plain words throughout: "the token" and
                "the reference" are our vocabulary, and most people reading this
                are new to shares. */}
            {/* Only when the market is shut. Open is the ordinary case and
                needs no notice: a banner that is always there is furniture,
                and the one time it carries news it reads as furniture too. */}
            {session && !session.isOpen && (
              <div className="flex items-start gap-2 rounded-lg bg-ds-panel px-5 py-3 text-[12px] leading-[1.45] [&_svg]:mt-0.5">
                <Clock className="size-3.5 shrink-0 text-ds-muted" />
                <div className="min-w-0">
                  <p className="font-medium text-ds-ink">
                    US markets are closed{opensAt ? ` until ${opensAt}` : ""}.
                  </p>
                  <p className="mt-1 text-ds-muted">
                    You can still place your order. We’ll check the latest market price before processing it
                    and let you know if there’s a significant difference.
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="order-3 flex min-w-0 flex-col gap-4 md:gap-6 xl:order-none">
            {/* What you hold of it and what it could borrow, side by side and level; one alone takes the row. */}
            <div className="grid items-stretch gap-4 empty:hidden md:gap-6 lg:grid-cols-2 [&>*:only-child]:lg:col-span-2">
              {(holding || basketValue > 0) && (
                <Position
                  h={holding}
                  basketValue={basketValue}
                  stockTodayPct={priced.todayPct}
                  parts={heldAs.parts}
                  accepted={heldAs.accepted}
                />
              )}
              <BorrowPanel ticker={instrument.ticker} name={instrument.name} />
            </div>

            <Stats p={priced} />

            <About i={instrument} />

            {prices.isError ? (
              <PriceError
                message="Could not reach Jupiter for live prices."
                onRetry={() => void prices.refetch()}
              />
            ) : (
              <Routes
                decision={decision}
                amount={Math.max(settled, 1)}
                loading={isLoading || isFetching}
                wrappers={instrument.wrappers}
              />
            )}
          </div>
        </div>

        <aside className="contents xl:sticky xl:top-20 xl:flex xl:flex-col xl:gap-6">
          <div className="order-2 min-w-0 xl:order-none">
            <Ticket
              name={instrument.name}
              raw={raw}
              onRaw={setRaw}
              settled={settled}
              cash={cash}
              decision={settled === amount ? decision : null}
              quoting={isLoading || settled !== amount}
              fair={priced.fair}
              acceptImpact={acceptImpact}
              onAcceptImpact={setAcceptImpact}
              onReview={() => setBuying(true)}
              side={side}
              onSide={setSide}
              holds={shares !== null && shares > 0}
              shares={shares}
              sellableShares={sellableShares}
              pledgedShares={pledged}
              positionUsd={positionUsd}
              sellableUsd={sellableUsd}
              proceeds={proceeds === null ? null : Number(proceeds.toString())}
              max={max}
              onMax={setMax}
            />
          </div>
          <div className="order-4 flex min-w-0 flex-col gap-4 md:gap-6 xl:order-none">
            {similar.length > 0 && (
              <RailList label="Similar" meta="Today" to="/invest" linkLabel="All stocks">
                <GlideRows as="ul">
                  {similar.map((r) => (
                    <li key={r.instrument.ticker}>
                      <Saved r={r} />
                    </li>
                  ))}
                </GlideRows>
              </RailList>
            )}
            <InBaskets ticker={t} />
          </div>
        </aside>
      </div>

      <OrderSheet
        instrument={instrument}
        prices={prices.data}
        open={buying}
        onClose={() => setBuying(false)}
        onPlaced={() => {
          /* The order is placed, so the ticket starts over. Left as it was, a
             "Sell all" keeps quoting a sale of shares that are now gone, and the
             tabs that could switch it back are hidden with the position. */
          setRaw("100");
          setSide("buy");
          setMax(false);
          setAcceptImpact(false);
        }}
        initial={amount}
        side={side}
        max={max}
        acceptImpact={acceptImpact}
        onAcceptImpact={setAcceptImpact}
      />
    </AppShell>
  );
};
