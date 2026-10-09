import type { Portfolio } from "@mercury/types";
import type { ReactNode } from "react";
import type { Instrument, Priced } from "../../market/hooks";
import { useHistory, useReturns } from "../../market/hooks";
import { InfoTip, MoveChip, RailFigure, RailHead } from "../../ui/ds";
import { ISSUER_NAME } from "../IssuerCompare";
import { usd, usdCompact, usdSigned } from "@mercury/view";
import { compact } from "../invest/shared";
import { HeaderFigure } from "../portfolio/Summary";
import { TOKEN_NAME, type HeldPart } from "./heldAs";

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
 * card's edge, then the returns as move chips. Where each figure comes from
 * is named in the tip beside the title.
 */
export const Stats = ({ p }: { p: Priced }) => {
  const t = p.instrument.ticker;
  const dayHistory = useHistory(t, "1D");
  const yearHistory = useHistory(t, "1Y");
  const weekHistory = useHistory(t, "1W");
  const perf = useReturns(t);
  const day = dayHistory.data?.points.map((pt) => pt.price) ?? null;
  const year = yearHistory.data?.points.map((pt) => pt.price) ?? null;
  const returns: [string, number | null][] = [
    ["1W", weekHistory.data?.changePct ?? null],
    ["1M", perf.data?.m1 ?? null],
    ["6M", perf.data?.m6 ?? null],
    ["1Y", perf.data?.y1 ?? null],
    ["5Y, a year", perf.data?.cagr5y ?? null],
  ];

  return (
    <section aria-label="Key stats" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-3 sm:px-5 pt-4">
        {/* "Live from chain" was true of five of the eight figures. The ranges
            and every return come from the share's own price history, so the
            headline claimed a source for numbers that do not have it. The tip
            named both and the label contradicted it; the label is what gets read. */}
        <RailHead
          title="Key stats"
          meta={
            <span className="flex items-center gap-2 text-ds-muted">
              Live
              <InfoTip label="Where these come from">
                The ranges and returns follow {p.instrument.name}&rsquo;s own share price. Volume and holders
                are read from Solana, where the token trades. Nothing here is typed in by us.
              </InfoTip>
            </span>
          }
        />
      </div>
      {/* Four figures, one row.
          Cut: "24h ago", which is the price in the header minus the change
          beside it; "Traders 24h" and "Net buyers 24h", which measure churn on
          a product for people who mean to hold something (ADR 0009); and
          "Liquidity", which the buy sheet answers better by quoting the price
          impact at the size actually being ordered. */}
      <dl className="mt-[11px] grid grid-cols-2 gap-x-6 gap-y-6 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-4">
        <HeaderFigure size="md" label="Today's range" value={range(day)} sub="Low to high" />
        <HeaderFigure size="md" label="52-week range" value={range(year)} sub="Low to high" />
        <HeaderFigure
          size="md"
          label="Traded today"
          value={usdCompact(p.volume24h)}
          sub="Across all issuers"
        />
        <HeaderFigure size="md" label="Holders" value={compact(p.holders)} sub="Wallets that own it" />
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
    <div className="px-3 sm:px-5 pt-4">
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
export const Fact = ({ k, tip, children }: { k: string; tip?: ReactNode; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="flex h-3.5 items-center gap-1.5 text-[14px] leading-none text-ds-muted">
      {k}
      {tip && (
        <InfoTip label={`About ${k.toLowerCase()}`} align="start">
          {tip}
        </InfoTip>
      )}
    </dt>
    <dd className="mt-[9px] truncate text-[14px] leading-none font-medium text-ds-ink">{children}</dd>
  </div>
);

/**
 * The position by token: the split as a hairline bar, then a line each — the
 * token, whether it can back a loan, its value and its shares. Set in white
 * under the grey facts so it reads as the footnote it is.
 */
const HeldAsList = ({ parts }: { parts: readonly HeldPart[] }) => {
  const total = parts.reduce((s, p) => s + p.shares, 0);
  return (
    <div className="px-3 sm:px-5 pt-4 pb-4">
      <p className="text-[12px] leading-none text-ds-muted">Held as</p>
      {parts.length > 1 && (
        <div className="mt-3 flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {parts.map((p) => (
            <span
              key={p.issuer}
              className={p.lendable ? "bg-ds-ink" : "bg-ds-divider"}
              style={{ width: `${total > 0 ? (p.shares / total) * 100 : 0}%` }}
            />
          ))}
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {parts.map((p) => (
          <li key={p.issuer} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${p.lendable ? "bg-ds-ink" : "bg-ds-divider"}`}
              />
              <span className="min-w-0">
                <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                  {TOKEN_NAME[p.issuer]}
                </span>
                <span className="block text-[12px] leading-4 text-ds-muted">
                  {p.lendable
                    ? p.pledged > 0
                      ? `Borrowable · ${p.pledged.toFixed(4)} pledged`
                      : "Borrowable"
                    : "Not borrowable"}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                {usd(p.valueUsd)}
              </span>
              <span className="block text-[12px] leading-4 text-ds-muted">{p.shares.toFixed(4)} shares</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * What you hold of it, if anything: the value at 28px, then its four figures
 * in a grey panel set like the About facts.
 */
export const Position = ({
  h,
  basketValue,
  stockTodayPct,
  parts,
  accepted,
}: {
  h: Holding | undefined;
  basketValue: number;
  stockTodayPct: number | null;
  /** The position by issuer, when known. */
  parts?: readonly HeldPart[] | null | undefined;
  /** Kamino takes this ticker at all. */
  accepted?: boolean | null | undefined;
}) => {
  const shares = Number(h?.shares ?? 0);
  const walletValue = Number(h?.valueUsd ?? 0);
  const value = walletValue + basketValue;
  const cost = Number(h?.costBasisUsd ?? 0);
  const ret = Number(h?.unrealisedPnlUsd ?? 0);
  const retPct = cost > 0 ? (ret / cost) * 100 : 0;
  const pledged = Number(h?.pledgedShares ?? 0);
  const today = h ? Number(h.changePct24h) : stockTodayPct;
  return (
    // A column, so the grey panel runs to 4px from the foot when the row is taller than it.
    <section aria-label="Your position" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
      <div className="px-3 sm:px-5 pt-4">
        <RailHead title="Your position" to="/portfolio" linkLabel="Portfolio" />
        <div className="mt-[15px]">
          <RailFigure
            value={usd(value)}
            sub={
              h
                ? `${shares.toFixed(4)} wallet & pledged shares${pledged > 0 ? ` · ${pledged.toFixed(4)} pledged to Kamino` : ""}`
                : "Held in your Glider smart account"
            }
          />
        </div>
      </div>
      <dl className="mt-3 grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5">
        <Fact k="Wallet & pledged">{h ? usd(walletValue) : "—"}</Fact>
        <Fact k="In baskets">{basketValue > 0 ? usd(basketValue) : "—"}</Fact>
        <Fact k="Wallet return">
          {h && cost > 0 ? (
            <span className={ret < 0 ? "text-ds-loss" : "text-ds-up"}>
              {usdSigned(ret)}{" "}
              <span className="text-[12px] font-normal text-ds-muted">
                {ret >= 0 ? "+" : "−"}
                {Math.abs(retPct).toFixed(2)}%
              </span>
            </span>
          ) : (
            "—"
          )}
        </Fact>
        <Fact k="Today">
          <span className="-my-[3px] inline-flex">
            <MoveChip value={today} light />
          </span>
        </Fact>
        <Fact k="Wallet average cost">{shares > 0 && cost > 0 ? usd(cost / shares) : "—"}</Fact>
        <Fact k="Wallet cost basis">{h && cost > 0 ? usd(cost) : "—"}</Fact>
      </dl>
      {/* One stock to the reader, but two tokens underneath, and only one of them
          backs a loan. Shown when that difference is real: more than one token
          held, or a ticker Kamino lends against. */}
      {parts && parts.length > 0 && (parts.length > 1 || accepted) && <HeldAsList parts={parts} />}
    </section>
  );
};

/** What it is, then the plain facts of how you hold it here, in a grey panel. */
export const About = ({ i }: { i: Instrument }) => {
  const issuers = [...new Set(i.wrappers.map((w) => ISSUER_NAME[w.issuer]))];
  /*
   * No "Tokens" row. "Where your order goes" lists every token by name
   * against its issuer, its price and whether it won — which is the same
   * list, doing something with it. Who issues them is a fact about the
   * company's wrapper rather than about this order, so that one stays.
   */
  const facts: [string, string][] = [
    ["Sector", i.sector],
    ["Ticker", i.ticker],
    ["Issued by", issuers.join(" and ")],
    ["Trades", "Around the clock, on Solana"],
    ["Minimum", "$5"],
  ];
  return (
    <section aria-label="About" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-3 sm:px-5 pt-4">
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
