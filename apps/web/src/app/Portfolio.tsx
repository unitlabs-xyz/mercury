import { useState } from "react";
import { Link } from "react-router-dom";
import type { Portfolio as PortfolioWire } from "@mercury/types";
import { ArrowDown, ArrowUp, ChevronRight, Clock, Plus, Trend } from "../ui/icons";
import { useMarketStatus, usePortfolio, useSignedIn } from "../api/hooks";
import { useUniverse } from "../market/hooks";
import { AppShell } from "./AppShell";
import { isUp, pct, shares as fmtShares, usd, usdSigned } from "./format";
import { ValueChart, type Range } from "./ValueChart";
import { Welcome } from "./Welcome";

const RANGES: Range[] = ["1W", "1M"];

type Holding = PortfolioWire["holdings"][number];

const Move = ({ value, dir }: { value: string; dir: "up" | "down" | "queued" }) => {
  if (dir === "queued")
    return (
      <span className="rounded-md bg-warn-tint px-[7px] py-[3px] text-[12px] font-semibold text-warn">
        {value}
      </span>
    );
  const up = dir === "up";
  return (
    <span
      className={`flex items-center gap-[3px] rounded-md px-[7px] py-[3px] text-[12px] font-semibold ${
        up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"
      }`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {value}
    </span>
  );
};

/**
 * Stocks and cash, and nothing else. Baskets are not in this version — the
 * Symmetry spike has not resolved — so the row is absent rather than zero.
 */
const splitOf = (p: PortfolioWire) => {
  const total = Number(p.totalValueUsd);
  const cash = Number(p.cashUsd);
  const stocks = total - cash;
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return [
    { label: "Stocks", value: usd(stocks), share: share(stocks) },
    { label: "Cash", value: usd(cash), share: share(cash) },
  ];
};

/**
 * The statement head, on one sheet: the figure, what it is made of, its
 * history, and the two things you can do about it. Keeping the actions here
 * rather than in the page header puts them beside the balance they act on.
 */
const Position = ({
  data,
  range,
  setRange,
}: {
  data: PortfolioWire | undefined;
  range: Range;
  setRange: (r: Range) => void;
}) => {
  const up = isUp(data?.changeUsd);
  return (
    <section aria-label="Total value" className="rounded-2xl border border-cardline bg-white px-6 py-[22px]">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <div>
          <p className="text-[13px] font-medium text-muted">Total value</p>
          <p className="mt-1.5 text-[42px] leading-[1.1] font-semibold tracking-[-0.035em] tabular-nums">
            {data ? usd(data.totalValueUsd) : "—"}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2.5">
            <span
              className={`flex items-center gap-1 rounded-md py-[3px] pr-[9px] pl-[7px] text-[14px] font-semibold ${
                up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"
              }`}
            >
              {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {pct(data?.changePct)}
            </span>
            <span className={`text-[14px] font-medium ${up ? "text-up-deep" : "text-down-deep"}`}>
              {usdSigned(data?.changeUsd)}
            </span>
            <span className="text-[13px] text-faint">today</span>
          </p>

          {/* Stated, not drawn. The share is the number, so it does not need a bar. */}
          <dl className="mt-6 border-t border-hair">
            {(data ? splitOf(data) : []).map((s) => (
              <div key={s.label} className="flex items-baseline gap-4 border-b border-hair py-2.5">
                <dt className="flex-1 text-[14px] text-ink-soft">{s.label}</dt>
                <dd className="w-[44px] text-right text-[13px] tabular-nums text-faint">
                  {Math.round(s.share)}%
                </dd>
                <dd className="w-[92px] text-right text-[14px] font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0">
          {/* Stranded on the right when the chart is the whole column. */}
          <div className="flex justify-start lg:justify-end">
            <div className="flex gap-1 rounded-lg bg-shell p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={`min-h-11 rounded-md px-3.5 font-mono text-[12px] transition-colors sm:min-h-0 sm:px-2.5 sm:py-1 ${
                    range === r
                      ? "bg-white text-ink shadow-[0_1px_2px_rgba(27,26,23,0.07)]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <ValueChart range={range} />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2.5 border-t border-hair pt-6">
        <Link
          to="/money"
          className="flex items-center gap-[7px] rounded-[9px] border border-btnline bg-white px-3.5 py-2.5 max-sm:min-h-11 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
        >
          <Plus className="size-[15px]" />
          Add cash
        </Link>
        <Link
          to="/invest"
          className="flex items-center gap-[7px] rounded-[9px] bg-brand px-4 py-2.5 max-sm:min-h-11 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          <Trend className="size-[15px]" />
          Invest
        </Link>
      </div>
    </section>
  );
};

const Row = ({ h, logo }: { h: Holding; logo: string | undefined }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-hair px-6 py-4 transition-colors last:border-b-0 hover:bg-shell lg:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_110px_28px]">
    <div className="flex min-w-0 items-center gap-3">
      {logo ? (
        <img
          src={logo}
          alt=""
          width={34}
          height={34}
          loading="lazy"
          className="size-[34px] shrink-0 rounded-full"
        />
      ) : (
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-faint text-[13px] font-bold text-white">
          {h.ticker.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold">{h.name}</span>
          {h.wrapperCount > 1 && (
            <span className="rounded bg-chip px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
              {h.wrapperCount} issuers
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-faint">{h.ticker}</p>
      </div>
    </div>

    <span className="hidden text-right text-[14px] tabular-nums text-muted lg:block">
      {fmtShares(h.shares)}
    </span>
    <span className="hidden text-right text-[14px] tabular-nums text-muted lg:block">
      {Number(h.shares) > 0 ? usd(Number(h.valueUsd) / Number(h.shares)) : "—"}
    </span>
    <span className="text-right text-[15px] font-semibold tabular-nums lg:text-[14px]">
      {usd(h.valueUsd)}
    </span>
    <span className="hidden justify-end lg:flex">
      <Move value={pct(h.changePct24h)} dir={isUp(h.changePct24h) ? "up" : "down"} />
    </span>
    <span className="hidden justify-end text-faint lg:flex">
      <ChevronRight className="size-4" />
    </span>
  </div>
);

export const Portfolio = () => {
  const [range, setRange] = useState<Range>("1W");
  const signedIn = useSignedIn();
  const portfolio = usePortfolio();
  const status = useMarketStatus();
  const universe = useUniverse();

  const logoFor = (ticker: string) => universe.data?.find((i) => i.ticker === ticker)?.logo;
  const holdings = portfolio.data?.holdings ?? [];

  return (
    <AppShell
      current="portfolio"
      title="Portfolio"
      aside={
        /* The sidebar stamps this already; it is only needed where that is hidden. */
        status.data && (
          <span className="flex items-center gap-1.5 rounded-full bg-warn-tint px-2.5 py-1 text-[12px] font-medium text-warn lg:hidden">
            <Clock className="size-[13px]" />
            {status.data.isOpen ? "Market open" : "Market closed"}
          </span>
        )
      }
    >
      <Welcome />

      <div className="mt-8">
        <Position data={portfolio.data} range={range} setRange={setRange} />
      </div>

      <section aria-label="Holdings" className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Holdings</h2>
          <span className="text-[13px] text-muted">
            {holdings.length === 0 ? "Nothing yet" : `${holdings.length} positions, largest first`}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-cardline bg-white">
          {holdings.length > 0 && (
            <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_110px_28px] gap-4 border-b border-hair px-6 py-2.5 text-[12px] font-medium text-faint lg:grid">
              <span>Name</span>
              <span className="text-right">Shares</span>
              <span className="text-right">Price</span>
              <span className="text-right">Value</span>
              <span className="text-right">Today</span>
              <span />
            </div>
          )}

          {holdings.map((h) => (
            <Row key={h.ticker} h={h} logo={logoFor(h.ticker)} />
          ))}

          {holdings.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-[15px] font-medium">
                {signedIn ? "You do not hold anything yet" : "Sign in to see your portfolio"}
              </p>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] text-muted">
                {portfolio.isError
                  ? "We could not reach your account just now."
                  : signedIn
                    ? "Anything you buy, or send to your wallet, shows up here."
                    : "Your holdings live in your own wallet, and only you can see them."}
              </p>
              {signedIn && (
                <Link
                  to="/invest"
                  className="mt-5 inline-flex items-center gap-[7px] rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
                >
                  <Trend className="size-[15px]" />
                  Browse stocks
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
};
