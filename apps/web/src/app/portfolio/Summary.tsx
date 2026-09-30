import type { ReactNode } from "react";

import type { Dashboard } from "../../api/dashboard";
import { Button, ButtonLink } from "../../ui/Button";
import { ArrowUp, Card, Plus } from "../../ui/icons";
import { pct, usd, usdCompact, usdSigned } from "../format";
import { ValueChart, useHistory, type Range } from "../ValueChart";
import { HexAllocation, type Slice } from "./HexAllocation";
import { RailHead, RangeSwitch } from "../../ui/ds";
import type { Model } from "./model";
import { Skeleton, relDay } from "./ui";

const RANGES: Range[] = ["1D", "1W", "1M"];

/**
 * One figure in a grey panel: a muted label, the value, one line of context.
 * 24px in the portfolio header; `size="md"` sets it at 20 for denser grids
 * (the stock page's key stats).
 */
export const HeaderFigure = ({
  label,
  value,
  sub,
  tone,
  size = "lg",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "warn" | undefined;
  size?: "lg" | "md";
}) => (
  <div className="min-w-0">
    <dt className="truncate text-[14px] text-ds-muted">{label}</dt>
    <dd
      // The denser grid wraps a long value (a price range) rather than cutting it off.
      className={`mt-[7px] ${size === "md" ? "text-[20px] leading-[1.15]" : "truncate text-[24px] leading-none"} font-medium ${
        tone === "up"
          ? "text-ds-up"
          : tone === "down"
            ? "text-ds-down"
            : tone === "warn"
              ? "text-warn"
              : "text-ds-ink"
      }`}
    >
      {value}
    </dd>
    {sub && (
      <dd
        // A 16px line so descenders (the g of "borrowing") are not clipped by the
        // truncation; 2px less above keeps the text where it was.
        className={`${size === "md" ? "mt-1.5" : "mt-[11px]"} truncate text-[12px] leading-4 text-ds-ink/80`}
      >
        {sub}
      </dd>
    )}
  </div>
);

/** Today's move: the percentage in a tinted chip, then the dollars and "today". */
const TodayMove = ({
  pctValue,
  usdValue,
}: {
  pctValue: number | undefined;
  usdValue: number | undefined;
}) => {
  const down = (usdValue ?? 0) < 0;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-none">
      <span
        className={`inline-flex h-5 items-center rounded-md px-2 text-[12px] ${
          down ? "bg-ds-down-chip text-ds-down" : "bg-ds-up-chip text-ds-up"
        }`}
      >
        <span className="opacity-80">{pctValue === undefined ? "—" : pct(pctValue)}</span>
      </span>
      <span className={`opacity-80 ${down ? "text-ds-down" : "text-ds-up"}`}>{usdSigned(usdValue)}</span>
      <span className="-ml-0.5 text-ds-ink/80">today</span>
    </p>
  );
};

/**
 * The account in one card, to the portfolio header design: what you are worth
 * and the verbs on the left; the supporting figures in a grey panel inset 4px
 * on the right, spread evenly from 85px in. Below xl the panel stacks under.
 */
export const AccountHeader = ({
  m,
  dash,
  apr,
}: {
  m: Model | undefined;
  dash: Dashboard | undefined;
  apr: number;
}) => {
  const card = dash?.card;
  const owes = card !== null && card !== undefined && card.statementBalanceUsd > 0;
  return (
    <section aria-label="Account" className="flex flex-col rounded-xl bg-white xl:min-h-[189px] xl:flex-row">
      <div className="shrink-0 p-6 xl:w-[395px]">
        <p className="text-[14px] leading-none font-medium text-ds-ink">Net worth</p>
        {m ? (
          <p className="mt-[9px] text-[36px] leading-none font-medium text-ds-ink">
            {usd(m.total - m.borrowed)}
          </p>
        ) : (
          <Skeleton className="mt-2 h-9 w-48" />
        )}
        <TodayMove pctValue={m?.changePct} usdValue={m?.changeUsd} />
        <div className="mt-[22px] flex flex-wrap gap-2">
          <ButtonLink to="/invest" variant="primary">
            Invest
          </ButtonLink>
          <ButtonLink to="?add=cash" icon={<Plus />}>
            Add cash
          </ButtonLink>
          <ButtonLink to="?send=usdc" icon={<ArrowUp className="rotate-45" />}>
            Send
          </ButtonLink>
          {/* A shortcut only while the bill is close; otherwise the card panel owns it. */}
          {owes && Date.parse(card.statementDue) - Date.now() < 7 * 86_400_000 && (
            <Button icon={<Card />}>Pay card {usdCompact(card.statementBalanceUsd)}</Button>
          )}
        </div>
      </div>

      <dl className="m-1 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-center xl:justify-between xl:py-0 xl:pr-[61px] xl:pl-[85px]">
        <HeaderFigure
          label="Invested"
          value={m ? usd(m.stocks) : "—"}
          sub={m ? `${m.rows.length} positions` : undefined}
        />
        <HeaderFigure
          label="Total return"
          value={m && m.costBasis > 0 ? usdSigned(m.returnUsd) : "—"}
          sub={
            m && m.costBasis > 0
              ? `${m.returnUsd >= 0 ? "+" : "−"}${pct(m.returnPct)} all time`
              : "Nothing bought yet"
          }
          tone={m && m.costBasis > 0 ? (m.returnUsd < 0 ? "down" : "up") : undefined}
        />
        <HeaderFigure
          label="Cash"
          value={m ? usd(m.cash) : "—"}
          sub={`Earning ${pct(apr * 100, 1)} a year`}
        />
        <HeaderFigure
          label="Borrowed"
          value={m ? usd(m.borrowed) : "—"}
          sub={
            m
              ? m.power > 0
                ? `${usdCompact(m.available)} more available`
                : "Nothing to borrow against"
              : undefined
          }
          tone={m && (m.health === "margin_call" || m.health === "liquidation") ? "down" : undefined}
        />
        <HeaderFigure
          label="Card due"
          value={card ? usd(card.statementBalanceUsd) : "—"}
          sub={card ? (owes ? relDay(card.statementDue) : "Nothing due") : "No card yet"}
          tone={
            owes && !card.autopay && ["today", "tomorrow"].includes(relDay(card.statementDue))
              ? "warn"
              : undefined
          }
        />
      </dl>
    </section>
  );
};

/**
 * One question: how has it done lately? The headline is the change over the
 * chosen range; the total it ended on is the supporting figure.
 */
/**
 * How the account has moved over the range, to performance.svg: the change at
 * 28px in green (or red), a chip with the percentage and the daily average
 * beside it, the range switch top right, and the dot chart under them.
 */
export const Performance = ({
  m,
  range,
  setRange,
}: {
  m: Model | undefined;
  range: Range;
  setRange: (r: Range) => void;
}) => {
  const history = useHistory(range);
  const first = history?.[0]?.value;
  const last = history?.[history.length - 1]?.value;
  const change = first !== undefined && last !== undefined ? last - first : null;
  const days = range === "1D" ? 1 : range === "1W" ? 7 : 30;
  /*
   * A move too small to print is not a fall. Below half a cent `usdSigned`
   * rounds to zero and rendered "−$0.00" in the loss colour — a minus sign in
   * front of nothing, which reads as a loss the figure itself denies. Flat is
   * its own state: no sign, and the neutral ink.
   */
  const flat = change !== null && Math.abs(change) < 0.005;
  const down = change !== null && change < 0 && !flat;
  return (
    <section aria-label="Performance" className="flex min-w-0 flex-col rounded-xl bg-white px-6 pt-5 pb-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] leading-none font-medium text-ds-ink">Performance</h2>
          {change !== null && first !== undefined ? (
            <p className="mt-[11px] flex flex-wrap items-center gap-x-2">
              <span
                className={`text-[28px] leading-none font-medium ${
                  flat ? "text-ds-ink" : down ? "text-ds-down" : "text-ds-gain"
                }`}
              >
                {flat ? usd(0) : usdSigned(change)}
              </span>
              <span
                className={`inline-flex h-5 translate-y-1 items-center rounded-md px-1.5 text-[12px] leading-none font-medium ${
                  flat
                    ? "bg-ds-panel text-ds-muted"
                    : down
                      ? "bg-ds-fall-chip text-ds-fall"
                      : "bg-ds-up-chip text-ds-up"
                }`}
              >
                <span className="opacity-80">{pct((change / first) * 100)}</span>
              </span>
              <span className="translate-y-1 text-[12px] leading-none text-ds-ink/80">
                {range === "1D" ? "today" : `${usdSigned(change / days)} avg/day`}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-[14px] leading-none text-ds-muted">
              {m ? `Total value ${usd(m.total)}` : "—"}
            </p>
          )}
        </div>
        <RangeSwitch options={RANGES} value={range} onChange={setRange} />
      </header>
      {/* The chart takes its full height only when there is a line to draw. */}
      <div className={`mt-[14px] flex flex-1 ${history ? "min-h-[365px]" : ""}`}>
        <ValueChart
          range={range}
          onZoom={(dir) =>
            setRange(RANGES[Math.min(RANGES.length - 1, Math.max(0, RANGES.indexOf(range) + dir))]!)
          }
        />
      </div>
    </section>
  );
};

/** Top sectors, then everything else folded into one, then cash: at most five slices, one hue each. */
const slicesOf = (m: Model): Slice[] => {
  const top = m.sectors.slice(0, m.sectors.length > 4 ? 3 : 4);
  const rest = m.sectors.slice(top.length);
  const restValue = rest.reduce((s, r) => s + r.value, 0);
  const restOpen = rest.reduce((s, r) => s + r.value / (1 + r.changePct / 100), 0);
  return [
    ...top.map((s) => ({ key: s.name, label: s.name, value: s.value, changePct: s.changePct })),
    ...(rest.length
      ? [
          {
            key: "other",
            label: `${rest.length} other sectors`,
            value: restValue,
            changePct: restOpen > 0 ? ((restValue - restOpen) / restOpen) * 100 : 0,
          },
        ]
      : []),
    ...(m.cash > 0 ? [{ key: "cash", label: "Cash", value: m.cash, changePct: null }] : []),
  ];
};

/**
 * One question: where is my money? Built to allocation.svg: the rail-card title
 * with the total beside it, the hex graph in a 208px slot, then the legend.
 */
export const Allocation = ({ m }: { m: Model | undefined }) => (
  <section aria-label="Allocation" className="flex min-w-0 flex-col rounded-xl bg-white px-6 pt-5 pb-[14px]">
    <RailHead title="Allocation" meta={m && m.total > 0 ? usd(m.total) : undefined} />
    <div className="mt-[25px]">
      {!m ? (
        <Skeleton className="h-[208px] w-full" />
      ) : m.total === 0 ? (
        <div className="grid min-h-[200px] place-items-center rounded-lg bg-ds-panel px-6 py-8 text-center">
          <div>
            <p className="text-[14px] leading-none font-medium text-ds-ink">Nothing to show yet</p>
            <p className="mx-auto mt-2.5 max-w-[34ch] text-[12px] leading-[1.45] text-ds-muted">
              Add cash or buy a stock, and this shows where your money sits.
            </p>
          </div>
        </div>
      ) : (
        <HexAllocation slices={slicesOf(m)} total={m.total} />
      )}
    </div>
  </section>
);
