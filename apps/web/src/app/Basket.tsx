import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { symmetryUrl, useBaskets, type Basket as BasketDef } from "../api/baskets";
import { usePortfolio } from "../api/hooks";
import { RANGES, type Span } from "../market/hooks";
import { Button, ButtonLink } from "../ui/Button";
import {
  Chevron,
  GlideRows,
  InfoTip,
  MoveChip,
  RailFigure,
  RailHead,
  RangeSwitch,
  StatusChip,
} from "../ui/ds";
import { Alert, Clock } from "../ui/icons";
import { AppShell } from "./AppShell";
import { created, feeLabel, shortAddress, useValued, type Valued } from "./baskets/model";
import { BasketLine, Stack, WeightBar, weight } from "./baskets/parts";
import { DotChart } from "./DotChart";
import { usd, usdSigned } from "@mercury/view";
import { RailList } from "./invest/Rail";
import { Mark, points } from "./invest/shared";
import { LiveStatusChip } from "./LiveStatus";
import { Skeleton } from "./portfolio/ui";
import { Fact, RailLine } from "./stock/Panels";
import { AmountWell, Note } from "./stock/Ticket";

const SINCE: Record<Span, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "6M": "past six months",
  "1Y": "past year",
  "5Y": "past five years",
};

const Missing = ({ loading }: { loading: boolean }) => (
  <AppShell current="baskets" title="Baskets" quiet>
    <section className="rounded-xl bg-white px-6 py-12 text-center">
      {loading ? (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <Skeleton className="h-12 w-28 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      ) : (
        <>
          <p className="text-[14px] leading-none font-medium text-ds-ink">We don't have that basket</p>
          <p className="mt-3 text-[14px] text-ds-muted">It may have been renamed or closed.</p>
          <ButtonLink to="/baskets" variant="primary" className="mt-5">
            Back to Baskets
          </ButtonLink>
        </>
      )}
    </section>
  </AppShell>
);

/**
 * Every stock in it, as the holdings table sets rows: the stock, how much of
 * the basket it is (set and now) with a bar, its price and today's move. Each
 * opens the stock's own page.
 */
const Inside = ({ v }: { v: Valued }) => {
  const legs = [...v.legs].sort((a, b) => b.target - a.target);
  const max = Math.max(...legs.map((l) => Math.max(l.target, l.current ?? 0)));
  return (
    <section aria-label="What's inside" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead
          title="What's inside"
          meta={
            <span className="flex items-center gap-2 text-ds-muted">
              {legs.length} stocks
              <InfoTip label="About the weights" align="start">
                The line marks the weight each stock was set to; the bar is where it has drifted since, as
                prices moved. This basket does not rebalance, so it only goes back when the creator changes
                it.
              </InfoTip>
            </span>
          }
        />
      </div>
      <div className="mt-[11px] overflow-x-auto rounded-lg bg-ds-panel p-1">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[minmax(0,1fr)_200px_96px_88px] gap-x-6 px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted">
            <span>Stock</span>
            <span>Weight · set / now</span>
            <span className="text-right">Price</span>
            <span className="text-right">Today</span>
          </div>
          <GlideRows as="ul">
            {legs.map((l) => (
              <li key={l.ticker} data-row className="relative">
                <Link
                  to={`/invest/${l.ticker}`}
                  className="relative grid h-15 grid-cols-[minmax(0,1fr)_200px_96px_88px] items-center gap-x-6 rounded-md px-4 text-[14px] leading-none"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {l.instrument ? (
                      <Mark i={l.instrument} size={36} />
                    ) : (
                      <Skeleton className="size-9 rounded-full" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ds-ink">
                        {l.instrument?.name ?? l.ticker}
                      </span>
                      <span className="mt-[6px] block truncate text-[12px] text-ds-muted">
                        {l.ticker}
                        {l.instrument ? ` · ${l.instrument.sector}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="w-[92px] shrink-0 text-[14px] whitespace-nowrap">
                      <span className="text-ds-muted">{weight(l.target)}</span>
                      <span className="text-ds-muted"> / </span>
                      <span className="font-medium text-ds-ink">{weight(l.current)}</span>
                    </span>
                    <WeightBar leg={l} max={max} />
                  </span>
                  <span className="text-right font-medium text-ds-ink">{usd(l.fair)}</span>
                  <span className="flex justify-end">
                    <MoveChip value={l.todayPct} light />
                  </span>
                </Link>
              </li>
            ))}
          </GlideRows>
        </div>
      </div>
    </section>
  );
};

/** What you hold of it: the value at 28px, then its figures in the grey panel, as the stock page's. */
const Position = ({ v, tokens, costUsd }: { v: Valued; tokens: number; costUsd: number }) => {
  const value = v.nav === null ? null : v.nav * tokens;
  const ret = value === null ? null : value - costUsd;
  const retPct = ret === null || costUsd <= 0 ? null : (ret / costUsd) * 100;
  return (
    <section aria-label="Your position" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title="Your position" to="/portfolio" linkLabel="Portfolio" />
        <div className="mt-[15px]">
          <RailFigure value={usd(value)} sub={`${tokens.toFixed(4)} ${v.basket.vault?.symbol ?? "tokens"}`} />
        </div>
      </div>
      <dl className="mt-3 grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5">
        <Fact k="Total return">
          {ret === null ? (
            "—"
          ) : (
            <span className={ret < 0 ? "text-ds-loss" : "text-ds-up"}>
              {usdSigned(ret)}{" "}
              <span className="text-[12px] font-normal text-ds-muted">
                {ret >= 0 ? "+" : "−"}
                {Math.abs(retPct ?? 0).toFixed(2)}%
              </span>
            </span>
          )}
        </Fact>
        <Fact k="Today">
          <span className="-my-[3px] inline-flex">
            <MoveChip value={v.todayPct} light />
          </span>
        </Fact>
        <Fact k="Average cost">{tokens > 0 ? usd(costUsd / tokens, 4) : "—"}</Fact>
        <Fact k="Cost basis">{usd(costUsd)}</Fact>
      </dl>
    </section>
  );
};

/** Fees, set as the borrow card for a stock you do not hold: the one figure that answers it, then the parts. */
const Fees = ({ b }: { b: BasketDef }) => {
  const d = b.depositFeeBps ?? b.feeBps;
  const w = b.withdrawFeeBps ?? 0;
  return (
    <section aria-label="Fees" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead
          title="Fees"
          meta={
            <span className="flex items-center gap-2 text-ds-muted">
              Set on the vault
              <InfoTip label="About the fees">
                Symmetry charges only on the way in and out, and the vault keeps them on chain where anyone
                can read them. There is no yearly management or performance fee.
              </InfoTip>
            </span>
          }
        />
        <div className="mt-[15px]">
          <RailFigure
            value={!d && !w ? "No fees" : `${feeLabel(d + w)} round trip`}
            sub="Nothing while you hold it"
          />
        </div>
      </div>
      <dl className="mt-3 grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5">
        <Fact k="To buy">{feeLabel(d)}</Fact>
        <Fact k="To sell">{feeLabel(w)}</Fact>
        <Fact k="Yearly">None</Fact>
        <Fact k="Minimum">{usd(b.minimumUsd, 0)}</Fact>
      </dl>
    </section>
  );
};

/** What it is, then the plain facts of the vault behind it, in a grey panel. */
const About = ({ b }: { b: BasketDef }) => {
  const vault = b.vault;
  const facts: [string, ReactNode][] = [
    ["Held by", "Symmetry vault"],
    ["Token", vault?.symbol ?? "—"],
    ["Created", vault ? created(vault.createdAt) : "—"],
    [
      "Vault",
      vault ? (
        <a
          href={symmetryUrl(vault.mint)}
          target="_blank"
          rel="noreferrer"
          className="text-ds-link hover:opacity-80"
        >
          {shortAddress(vault.address)}
        </a>
      ) : (
        "—"
      ),
    ],
    ["Made by", vault ? shortAddress(vault.creator) : "Mercury"],
    ["Rebalancing", "Off: weights drift"],
  ];
  return (
    <section aria-label="About" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title={`About ${b.name}`} />
        <p className="mt-[13px] max-w-[72ch] text-[14px] leading-[1.55] text-ds-muted">{b.description}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-3">
        {facts.map(([k, val]) => (
          <Fact key={k} k={k}>
            {val}
          </Fact>
        ))}
      </dl>
      <p className="flex items-start gap-2 px-5 py-[13px] text-[12px] leading-[1.45] text-ds-muted">
        Mercury does not hold your basket. If the app is ever gone, you can still withdraw it on Symmetry,
        straight from your wallet.
      </p>
    </section>
  );
};

/**
 * The order as a rail card, set like the stock ticket: the amount, then how it
 * splits across the stocks at their weights, the fee, and roughly how many
 * basket tokens that is. Any stock that cannot be bought fails the whole
 * basket; nothing is silently rebalanced (docs/04).
 */
const Ticket = ({
  v,
  raw,
  onRaw,
  cash,
}: {
  v: Valued;
  raw: string;
  onRaw: (s: string) => void;
  cash: number | null;
}) => {
  const amount = Number(raw) || 0;
  const b = v.basket;
  const fee = ((b.depositFeeBps ?? b.feeBps) / 10_000) * amount;
  const net = Math.max(0, amount - fee);
  const legs = [...v.legs].sort((a, c) => c.target - a.target);
  const under = amount > 0 && amount < Number(b.minimumUsd);
  const over = cash !== null && amount > cash;
  return (
    <section aria-label={`Invest in ${b.name}`} className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title={`Invest in ${b.name}`} meta={cash === null ? undefined : `${usd(cash)} cash`} />
      </div>

      <AmountWell raw={raw} onRaw={onRaw} />

      <dl className="flex flex-col gap-3 px-5 pt-5">
        {legs.map((l) => (
          <RailLine key={l.ticker} k={`${l.instrument?.name ?? l.ticker} · ${weight(l.target)}`}>
            {usd(net * l.target)}
          </RailLine>
        ))}
      </dl>
      <div className="mx-5 my-4 h-px bg-black/[0.06]" />
      <dl className="flex flex-col gap-3 px-5">
        <RailLine k="Fee">{fee > 0 ? usd(fee) : "None"}</RailLine>
        <RailLine k="You get">
          {v.nav && net > 0 ? `≈ ${(net / v.nav).toFixed(2)} ${b.vault?.symbol ?? "tokens"}` : "—"}
        </RailLine>
      </dl>

      {under && (
        <Note tone="warn" icon={<Clock />}>
          The minimum is {usd(b.minimumUsd, 0)}, so each stock gets enough to trade.
        </Note>
      )}
      {over && (
        <Note tone="down" icon={<Alert />}>
          More than your cash.{" "}
          <Link to="/money" className="font-medium underline underline-offset-2">
            Add cash
          </Link>
        </Note>
      )}

      <div className="px-5 pt-5 pb-5">
        <Button variant="primary" size="lg" disabled className="w-full">
          Basket orders open soon
        </Button>
        <p className="mt-3 text-center text-[12px] leading-none text-ds-muted">
          Buys all {legs.length} at once. Held afterwards as one position.
        </p>
      </div>
    </section>
  );
};

/**
 * One basket, laid out like a stock's page: its value and chart lead, then
 * what you hold, what it costs, what is inside and the vault behind it. The
 * rail holds the order and the other baskets.
 */
export const Basket = () => {
  const { slug = "" } = useParams();
  const [range, setRange] = useState<Span>("1M");
  const [raw, setRaw] = useState("100");
  const baskets = useBaskets();
  const portfolio = usePortfolio();
  const valued = useValued(baskets.data, range);
  const today = useValued(baskets.data, "1D");
  const v = valued.valued.find((x) => x.basket.slug === slug);
  const others = useMemo(() => today.valued.filter((x) => x.basket.slug !== slug), [today.valued, slug]);

  // A new basket starts at the default amount, not the last one typed.
  useEffect(() => setRaw("100"), [slug]);
  const chart = useMemo(() => (v?.series ? points(v.series, range) : null), [v?.series, range]);
  const zoom = useCallback(
    (dir: 1 | -1) =>
      setRange((r: Span) => RANGES[Math.min(RANGES.length - 1, Math.max(0, RANGES.indexOf(r) + dir))]!),
    [],
  );

  if (!v) return <Missing loading={baskets.isLoading} />;

  const b = v.basket;
  const up = (v.change ?? 0) >= 0;
  const changeUsd = v.nav === null || v.change === null ? null : v.nav - v.nav / (1 + v.change / 100);
  const cash = portfolio.data ? Number(portfolio.data.cashUsd) : null;

  return (
    <AppShell current="baskets" title={b.name} quiet>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center justify-between gap-3 md:mb-6">
        <p className="flex items-center gap-2 text-[14px] leading-none text-ds-muted">
          <Link to="/baskets" className="transition-colors hover:text-ds-ink">
            Baskets
          </Link>
          <Chevron />
          <span className="text-ds-ink">{b.name}</span>
        </p>
        <LiveStatusChip fetching={valued.fetching} at={valued.at} />
      </nav>

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <section aria-label="Value" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
            <div className="px-5 pt-5 pb-5">
              <div className="flex min-w-0 items-center gap-4">
                <Stack legs={v.legs} size={40} ring="ring-white" />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <h1 className="truncate text-[20px] leading-none font-medium text-ds-ink">{b.name}</h1>
                    <span className="flex flex-wrap items-center gap-[5px]">
                      <StatusChip tone="neutral" size="md">
                        {b.constituents.length} stocks
                      </StatusChip>
                      <StatusChip tone="neutral" size="md">
                        Symmetry
                      </StatusChip>
                      {b.position && (
                        <StatusChip tone="owned" size="md">
                          Owned
                        </StatusChip>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-[14px] leading-none text-ds-muted">
                    {b.vault?.symbol ?? "Basket"} · by {b.vault ? shortAddress(b.vault.creator) : "Mercury"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  {v.nav === null ? (
                    <Skeleton className="h-9 w-44" />
                  ) : (
                    <p className="text-[36px] leading-none font-medium text-ds-ink">{usd(v.nav, 4)}</p>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-none">
                    <MoveChip value={v.change} light />
                    <span className={up ? "text-ds-up" : "text-ds-fall-light"}>
                      {changeUsd === null
                        ? "—"
                        : `${changeUsd < 0 ? "−" : "+"}$${Math.abs(changeUsd).toFixed(4)}`}
                    </span>
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

            {b.vault && (
              <p className="flex items-start gap-2 rounded-lg bg-ds-panel px-5 py-[9px] text-[12px] leading-[1.45] text-ds-muted [&_svg]:mt-px">
                <Clock className="size-3.5 shrink-0" />
                Started at {usd(b.vault.startPrice)} on {created(b.vault.createdAt)}
                {v.sinceStart === null
                  ? "."
                  : `, ${v.sinceStart >= 0 ? "up" : "down"} ${Math.abs(v.sinceStart).toFixed(2)}% since.`}{" "}
                Before that, the chart is how these weights would have done.
              </p>
            )}
          </section>

          <div className="grid items-stretch gap-4 md:gap-6 lg:grid-cols-2 [&>*:only-child]:lg:col-span-2">
            {b.position ? <Position v={v} tokens={b.position.tokens} costUsd={b.position.costUsd} /> : null}
            <Fees b={b} />
          </div>

          <Inside v={v} />

          <About b={b} />
        </div>

        <aside className="flex flex-col gap-4 md:gap-6 xl:sticky xl:top-20">
          <Ticket v={v} raw={raw} onRaw={setRaw} cash={cash} />
          {others.length > 0 && (
            <RailList label="Other baskets" meta="Today" to="/baskets" linkLabel="All baskets">
              <GlideRows as="ul">
                {others.map((o) => (
                  <li key={o.basket.slug}>
                    <BasketLine v={o} figure={o.nav} sub={`${o.basket.constituents.length} stocks`} />
                  </li>
                ))}
              </GlideRows>
            </RailList>
          )}
        </aside>
      </div>
    </AppShell>
  );
};
