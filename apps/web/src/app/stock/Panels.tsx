import type { Portfolio } from "@mercury/types";
import type { ReactNode } from "react";
import type { Instrument, Priced } from "../../market/hooks";
import { useHistory, useReturns } from "../../market/hooks";
import { InfoTip, MoveChip, RailFigure, RailHead } from "../../ui/ds";
import { ISSUER_NAME } from "../IssuerCompare";
import { usd, usdCompact, usdSigned } from "../format";
import { compact } from "../invest/shared";
import { HeaderFigure } from "../portfolio/Summary";

type Holding = Portfolio["holdings"][number];

const range = (s: readonly number[] | null) =>
  s && s.length ? `${usd(Math.min(...s))} – ${usd(Math.max(...s))}` : "—";

/**
 * One line of a rail card, spaced like Coming up and Sectors: the label at 14
 * grey on the left, the value at 14 medium on the right, 20px tall.
 */
export const RailLine = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="flex h-5 items-center justify-between gap-3 text-[14px] leading-none">
    <dt className="truncate text-ds-muted">{k}</dt>
    <dd className="shrink-0 text-right font-medium text-ds-ink">{children}</dd>
  </div>
);

/**
 * The figures a buyer checks before buying, laid out like the portfolio
 * header: the title row, then the figures in a grey panel 4px in from the
 * card's edge, then the returns as move chips. Live figures and sample ones
 * are named apart in the page's footnote.
 */
export const Stats = ({ p }: { p: Priced }) => {
  const t = p.instrument.ticker;
  const dayHistory = useHistory(t, "1D");
  const yearHistory = useHistory(t, "1Y");
  const weekHistory = useHistory(t, "1W");
  const perf = useReturns(t);
  const day = dayHistory.data?.points.map((pt) => pt.price) ?? null;
  const year = yearHistory.data?.points.map((pt) => pt.price) ?? null;
  const traders = p.instrument.wrappers.reduce((s, w) => s + w.traders24h, 0);
  const returns: [string, number | null][] = [
    ["1W", weekHistory.data?.changePct ?? null],
    ["1M", perf.data?.m1 ?? null],
    ["6M", perf.data?.m6 ?? null],
    ["1Y", perf.data?.y1 ?? null],
    ["5Y, a year", perf.data?.cagr5y ?? null],
  ];

  return (
    <section aria-label="Key stats" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead
          title="Key stats"
          meta={
            <span className="flex items-center gap-2 text-ds-muted">
              Live from chain
              <InfoTip label="Which figures are live">
                Price, volume, liquidity, holders and routes are read live from chain. The chart and returns
                are the underlying share&rsquo;s own history, re-levelled onto the token&rsquo;s live price —
                the two trade a little apart.
              </InfoTip>
            </span>
          }
        />
      </div>
      <dl className="mt-[11px] grid grid-cols-2 gap-x-6 gap-y-6 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-4">
        <HeaderFigure size="md" label="24h ago" value={day ? usd(day[0]) : "—"} />
        <HeaderFigure size="md" label="Day range" value={range(day)} />
        <HeaderFigure size="md" label="52-week range" value={range(year)} />
        <HeaderFigure size="md" label="Volume 24h" value={usdCompact(p.volume24h)} />
        <HeaderFigure size="md" label="Liquidity" value={usdCompact(p.liquidity)} sub="Across all issuers" />
        <HeaderFigure size="md" label="Holders" value={compact(p.holders)} sub="Wallets on chain" />
        <HeaderFigure size="md" label="Traders 24h" value={compact(traders)} sub="Bought or sold" />
        <HeaderFigure
          size="md"
          label="Net buyers 24h"
          value={
            p.netBuyers24h === 0
              ? "0"
              : `${p.netBuyers24h > 0 ? "+" : "−"}${compact(Math.abs(p.netBuyers24h))}`
          }
          sub={p.netBuyers24h >= 0 ? "More buying than selling" : "More selling than buying"}
          tone={p.netBuyers24h > 0 ? "up" : p.netBuyers24h < 0 ? "down" : undefined}
        />
      </dl>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 text-[14px] leading-none">
        <span className="font-medium text-ds-ink">Returns</span>
        {returns.map(([k, v]) => (
          <span key={k} className="flex items-center gap-2 text-ds-muted">
            {k}
            <MoveChip value={v} light />
          </span>
        ))}
      </div>
    </section>
  );
};

/**
 * The borrow card for a stock you do not hold yet, set like the key stats: the title row,
 * one figure at 28px that answers the card, then the supporting figures in a
 * grey panel 4px in from the card's edge that fills the rest of its height (so
 * two side by side end level), and an optional action under it.
 */
export const FigureCard = ({
  label,
  head,
  value,
  sub,
  tone,
  wide,
  children,
  action,
}: {
  label: string;
  head: ReactNode;
  value: ReactNode;
  sub: ReactNode;
  tone?: "up" | "down" | "warn" | undefined;
  /** How many figures share a row on a card that has the page to itself. */
  wide?: 3 | 4;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <section aria-label={label} className="@container flex min-w-0 flex-col rounded-xl bg-white p-1">
    <div className="px-5 pt-4">
      {head}
      <div className="mt-3">
        <RailFigure value={value} sub={sub} tone={tone} />
      </div>
    </div>
    {/* Two figures a row at half width; the full set in one row when the card has
        the page to itself — three or four, so a card never leaves a column empty. */}
    <dl
      className={`mt-4 grid flex-1 grid-cols-2 content-start gap-x-6 gap-y-4 rounded-lg bg-ds-panel px-5 py-4 ${
        wide === 3 ? "@2xl:grid-cols-3" : "@2xl:grid-cols-4"
      }`}
    >
      {children}
    </dl>
    {/* 24px from the card's sides and 20px from its foot, counting the card's own 4px. */}
    {action && <div className="px-5 pt-3 pb-4">{action}</div>}
  </section>
);

/** One fact in a grey panel, as About sets them: the label at 14 grey over the value at 14 medium. */
export const Fact = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[14px] leading-none text-ds-muted">{k}</dt>
    <dd className="mt-[9px] truncate text-[14px] leading-none font-medium text-ds-ink">{children}</dd>
  </div>
);

/**
 * What you hold of it, if anything: the value at 28px, then its four figures
 * in a grey panel set like the About facts.
 */
export const Position = ({ h }: { h: Holding }) => {
  const shares = Number(h.shares);
  const value = Number(h.valueUsd);
  const cost = Number(h.costBasisUsd);
  const ret = value - cost;
  const retPct = cost > 0 ? (ret / cost) * 100 : 0;
  const pledged = Number(h.pledgedShares ?? 0);
  const today = h.changePct24h === null || h.changePct24h === undefined ? null : Number(h.changePct24h);
  return (
    // A column, so the grey panel runs to 4px from the foot when the row is taller than it.
    <section aria-label="Your position" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title="Your position" to="/portfolio" linkLabel="Portfolio" />
        <div className="mt-[15px]">
          <RailFigure
            value={usd(value)}
            sub={`${shares.toFixed(4)} shares${pledged > 0 ? ` · ${pledged.toFixed(4)} pledged to Kamino` : ""}`}
          />
        </div>
      </div>
      <dl className="mt-3 grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5">
        <Fact k="Total return">
          <span className={ret < 0 ? "text-ds-loss" : "text-ds-up"}>
            {usdSigned(ret)}{" "}
            <span className="text-[12px] font-normal text-ds-muted">
              {ret >= 0 ? "+" : "−"}
              {Math.abs(retPct).toFixed(2)}%
            </span>
          </span>
        </Fact>
        <Fact k="Today">
          <span className="-my-[3px] inline-flex">
            <MoveChip value={today} light />
          </span>
        </Fact>
        <Fact k="Average cost">{shares > 0 ? usd(cost / shares) : "—"}</Fact>
        <Fact k="Cost basis">{usd(cost)}</Fact>
      </dl>
    </section>
  );
};

/** What it is, then the plain facts of how you hold it here, in a grey panel. */
export const About = ({ i }: { i: Instrument }) => {
  const issuers = [...new Set(i.wrappers.map((w) => ISSUER_NAME[w.issuer]))];
  const facts: [string, string][] = [
    ["Sector", i.sector],
    ["Ticker", i.ticker],
    ["Tokens", i.wrappers.map((w) => w.symbol).join(" · ")],
    ["Issued by", issuers.join(" and ")],
    ["Trades", "Around the clock, on Solana"],
    ["Minimum", "$5"],
  ];
  return (
    <section aria-label="About" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title={`About ${i.name}`} />
        {i.about && (
          <p className="mt-[13px] max-w-[72ch] text-[14px] leading-[1.55] text-ds-muted">{i.about}</p>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <Fact key={k} k={k}>
            {v}
          </Fact>
        ))}
      </dl>
    </section>
  );
};
