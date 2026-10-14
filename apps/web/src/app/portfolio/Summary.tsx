import type { ReactNode } from "react";

import type { Dashboard } from "../../api/dashboard";
import { Button, ButtonLink } from "../../ui/Button";
import { ArrowUp, Card, Plus } from "../../ui/icons";
import { pct, usd, usdCompact, usdSigned } from "@mercury/view";
import { ValueChart, useHistory, type Range } from "../ValueChart";
import { usePortfolioHistory } from "../../api/hooks";
import { HexAllocation, type Slice } from "./HexAllocation";
import { RailHead, RangeSwitch } from "../../ui/ds";
import type { Model } from "./model";
import { Skeleton, relDay } from "./ui";

const RANGES: Range[] = ["1D", "1W", "1M"];

export const performancePercent = (change: number, openingValue: number): number | null =>
  openingValue === 0 ? (change === 0 ? 0 : null) : (change / openingValue) * 100;

/**
 * One figure in a grey panel: a muted label, the value, one line of context.
 * 24px in the portfolio header; `size="md"` sets it at 20 for denser grids
 * (the stock page's key stats).
 */
/**
 * The line under the Borrowed figure.
 *
 * With a loan it is the cushion, not the headroom. How much more could be
 * borrowed is the interesting number when nothing is owed; once something is,
 * the fall that would cost somebody their shares is the one that matters, and
 * it is the number that shrinks every time a loan is used to buy more
 * collateral. The maths is the server's `safeUntilDrop`.
 */
export const borrowedSub = (m: Model): string => {
  if (m.debtIsStale) return "As of an hour ago — we could not reach Kamino";
  if (m.borrowed <= 0) {
    return m.power > 0 ? `${usdCompact(m.available)} more available` : "Nothing to borrow against";
  }
  if (m.health === "liquidation") return "Being sold now — repay to stop it";
  if (m.health === "margin_call") return `Repay ${usdCompact(m.overTarget)} now`;
  if (m.health === "over_limit") return `Over the limit — repay ${usdCompact(m.overTarget)}`;
  return m.safeUntilDrop === null
    ? `${usdCompact(m.available)} more available`
    : `Safe unless your shares fall ${pct(m.safeUntilDrop * 100, 0)}`;
};

/**
 * The line under Stock P&L.
 *
 * The figure above it is what the stocks did; this says what being in them
 * cost. They used to be one number, which meant a holder whose stock had not
 * moved was shown a loss — the fee and the premium over the underlying quote
 * were inside the price their shares were recorded at. Both are shown because
 * both are true, and because they sum to the dollars.
 */
export const stockPnlSub = (m: Model): string => {
  if (m.costBasis <= 0) return `+${pct(0, 1)} · No recorded stock cost basis`;
  const move = `${m.marketReturnUsd >= 0 ? "+" : "−"}${pct(m.marketReturnPct)}`;
  // Under half a cent of cost is not worth a clause, and rounding it to
  // "$0.00 of fees" reads as a bug rather than as nothing.
  if (Math.abs(m.tradingCostUsd) < 0.005) return `${move} on what you paid for them`;
  // `usd`, not `usdCompact`: the cents are the point. A $0.23 fee on a $20 buy
  // is the whole of what this figure exists to show, and compact rounds it away.
  return m.tradingCostUsd > 0
    ? `${move} · ${usd(m.tradingCostUsd)} fees and spread`
    : `${move} · ${usd(-m.tradingCostUsd)} bought below the quote`;
};

/**
 * The line under Baskets.
 *
 * A total since the basket was funded, net of everything Glider charged.
 * Deliberately not shown beside the stacked figures above as if it were the
 * same measurement: a wallet holding's move can have its trading costs taken
 * off onto their own line, and a basket's cannot — the fills happen inside
 * Glider and we never see one.
 */
export const basketPnlSub = (m: Model): string => {
  if (m.basketCostBasis <= 0) return "No recorded basket cost";
  const pct = (m.basketReturnUsd / m.basketCostBasis) * 100;
  const move = `${m.basketReturnUsd >= 0 ? "+" : "−"}${usd(Math.abs(m.basketReturnUsd))}`;
  const partial = m.basketBasisIsComplete ? "" : ", partial";
  return `${move} · ${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% all in${partial}`;
};

/** Red once a fall has taken the loan somewhere the owner has to act on. */
export const borrowedTone = (m: Model): "down" | undefined =>
  m.health === "margin_call" || m.health === "liquidation" || m.health === "over_limit" ? "down" : undefined;

export const HeaderFigure = ({
  label,
  value,
  sub,
  tone,
  size = "lg",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "warn" | undefined;
  size?: "lg" | "md";
  /**
   * The figure is not known yet. The label still is, so it stays: these six
   * read as a set, and an em-dash beside a pulsing net worth said "nothing
   * here" about an account that was merely still loading.
   */
  loading?: boolean;
}) =>
  loading ? (
    <div className="min-w-0">
      <dt className="truncate text-[14px] text-ds-muted">{label}</dt>
      {/* Heights match the real figure's line box — 24px at lg, 23px at md —
          so nothing moves when the number arrives. */}
      <dd className="mt-[7px]">
        <Skeleton className={size === "md" ? "h-[23px] w-20" : "h-6 w-24"} />
      </dd>
      <dd className={size === "md" ? "mt-1.5" : "mt-[11px]"}>
        <Skeleton className="h-4 w-28" />
      </dd>
    </div>
  ) : (
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
          // truncation; 2px less above keeps the text where it was. On a phone's
          // two narrow columns it wraps instead: cut there, the line lost its
          // figure ("Safe unless your shares fall 6…").
          className={`${size === "md" ? "mt-1.5" : "mt-[11px]"} text-[12px] leading-4 text-pretty text-ds-ink/80 sm:truncate`}
        >
          {sub}
        </dd>
      )}
    </div>
  );

/** A quoted stock-price move, not a change in the account's net worth. */
const TodayMove = ({
  pctValue,
  usdValue,
}: {
  pctValue: number | null | undefined;
  usdValue: number | null | undefined;
}) => {
  const missing = pctValue === null || pctValue === undefined || usdValue === null || usdValue === undefined;
  const down = (usdValue ?? 0) < 0;
  return (
    <p
      className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] leading-none"
      title="Estimated from current wallet, pledged, and basket stock values and rolling 24-hour price changes; not investment return or net-worth change."
    >
      <span
        className={`inline-flex h-5 items-center rounded-md px-2 text-[12px] ${
          missing
            ? "bg-ds-panel text-ds-muted"
            : down
              ? "bg-ds-down-chip text-ds-down"
              : "bg-ds-up-chip text-ds-up"
        }`}
      >
        <span className="opacity-80">{pct(pctValue)}</span>
      </span>
      <span className={`opacity-80 ${missing ? "text-ds-muted" : down ? "text-ds-down" : "text-ds-up"}`}>
        {usdSigned(usdValue)}
      </span>
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
  failed = false,
}: {
  m: Model | undefined;
  dash: Dashboard | undefined;
  apr: number;
  /** The refresh failed. The banner above says so; these figures must not
      pulse as though an answer were still coming. */
  failed?: boolean;
}) => {
  const card = dash?.card;
  const waiting = !m && !failed;
  const owes = card !== null && card !== undefined && card.statementBalanceUsd > 0;
  return (
    <section aria-label="Account" className="flex flex-col rounded-xl bg-white xl:min-h-[189px] xl:flex-row">
      <div className="flex shrink-0 flex-col justify-center p-4 sm:p-6 xl:w-[395px]">
        <p className="text-[14px] leading-none font-medium text-ds-ink">Net worth</p>
        {m ? (
          <p className="mt-[9px] text-[36px] leading-none font-medium text-ds-ink">{usd(m.total)}</p>
        ) : (
          <Skeleton className="mt-2 h-9 w-48" />
        )}
        {/* A move that rounds to nothing is not news: no chip, no "+$0.00 today". */}
        {(!m || Math.abs(m.stockMove24hUsd ?? 0) >= 0.005) && (
          <TodayMove pctValue={m?.stockMove24hPct} usdValue={m?.stockMove24hUsd} />
        )}
        <div className="scroll-row mt-[22px] flex flex-wrap gap-2 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:px-4">
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

      {/*
       * The 85px inset is the five-figure design. A sixth figure needs 45px of
       * it back: at 1440 the row is exactly 31px too wide for the card
       * otherwise, and the whole page scrolls sideways. Only accounts holding
       * a basket pay the tighter inset, and only at xl.
       */}
      <dl
        className={`m-1 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-center xl:justify-between xl:py-0 xl:pr-[61px] ${
          m && m.basketUsd > 0 ? "xl:pl-10" : "xl:pl-[85px]"
        }`}
      >
        <HeaderFigure
          label="Holdings"
          loading={waiting}
          value={m ? usd(m.stocks) : "—"}
          sub={m ? `${m.rows.length} positions` : undefined}
        />
        <HeaderFigure
          label="Stock P&L"
          loading={waiting}
          value={m ? usdSigned(m.costBasis > 0 ? m.marketReturnUsd : 0) : "—"}
          sub={m ? stockPnlSub(m) : undefined}
          tone={m && m.costBasis > 0 ? (m.marketReturnUsd < 0 ? "down" : "up") : undefined}
        />
        {/* Only for an account that holds one. A basket's return is a total
            and cannot join the stacked figure beside it, so it gets its own. */}
        {m && m.basketUsd > 0 && (
          <HeaderFigure
            label="Baskets"
            value={usd(m.basketUsd)}
            sub={basketPnlSub(m)}
            /* No tone: this is what the baskets are worth, not what they made.
               Tinted by the return's sign, $3.99 down four cents was printed in
               the loss colour and read as a negative balance. The figures that
               carry a tone are the ones that carry a sign — the line below
               already says −$0.04. */
          />
        )}
        <HeaderFigure
          label="Cash"
          loading={waiting}
          value={m ? usd(m.cash) : "—"}
          sub={`Earning ${pct(apr * 100, 1)} a year`}
        />
        <HeaderFigure
          label="Borrowed"
          loading={waiting}
          value={m ? usd(m.borrowed) : "—"}
          sub={m ? borrowedSub(m) : undefined}
          tone={m ? borrowedTone(m) : undefined}
        />
        <HeaderFigure
          label="Card due"
          /* `card` null is a real answer — "No card yet". Only an absent
             dashboard is unknown, so only that pulses. */
          loading={dash === undefined}
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
  const recorded = usePortfolioHistory(range).data?.points;
  const first = history?.points[0]?.value;
  const last = history?.points[history.points.length - 1]?.value;
  const change = first !== undefined && last !== undefined ? last - first : null;
  /*
   * Of what was at work: the opening value plus whatever was added since. An
   * account that started empty and was funded today has a gain on the money
   * put in, not a percentage of zero.
   */
  const added = history?.excludesTransfers
    ? Math.max(0, Number(recorded?.[recorded.length - 1]?.netFlowUsd ?? 0))
    : 0;
  const percent = change !== null && first !== undefined ? performancePercent(change, first + added) : null;
  /*
   * A move too small to print is not a fall. Below half a cent `usdSigned`
   * rounds to zero and rendered "−$0.00" in the loss colour — a minus sign in
   * front of nothing, which reads as a loss the figure itself denies. Flat is
   * its own state: no sign, and the neutral ink.
   */
  const flat = change !== null && Math.abs(change) < 0.005;
  const down = change !== null && change < 0 && !flat;
  return (
    <section
      aria-label="Account value history"
      className="flex min-w-0 flex-col rounded-xl bg-white px-4 pt-5 pb-5 sm:px-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] leading-none font-medium text-ds-ink">Account value</h2>
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
                <span className="opacity-80">{percent === null ? "—" : pct(percent)}</span>
              </span>
              <span className="translate-y-1 text-[12px] leading-none text-ds-ink/80">
                {history?.excludesTransfers
                  ? "Change excluding external transfers"
                  : "Change in account value"}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-[14px] leading-none text-ds-muted">
              {m ? `Net worth ${usd(m.total)}` : <Skeleton className="h-[14px] w-36" />}
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

/** Direct stock sectors, baskets, and wallet cash: at most five slices. */
const slicesOf = (m: Model): Slice[] => {
  const cash = m.cash;
  const reserved = Number(cash > 0);
  const top = m.sectors.slice(0, Math.max(0, 4 - reserved));
  const rest = m.sectors.slice(top.length);
  const restValue = rest.reduce((s, r) => s + r.value, 0);
  const restKnown = rest.every((r) => r.changePct !== null);
  const restOpen = rest.reduce((s, r) => s + r.value / (1 + (r.changePct ?? 0) / 100), 0);
  return [
    ...top.map((s) => ({ key: s.name, label: s.name, value: s.value, changePct: s.changePct })),
    ...(rest.length
      ? [
          {
            key: "other",
            label: `${rest.length} other holdings`,
            value: restValue,
            changePct: restKnown && restOpen > 0 ? ((restValue - restOpen) / restOpen) * 100 : null,
          },
        ]
      : []),
    ...(cash > 0
      ? [
          {
            key: "cash",
            label: "Cash",
            value: cash,
            changePct: null,
          },
        ]
      : []),
  ];
};

/**
 * One question: where is my money? Built to allocation.svg: the rail-card title
 * with the total beside it, the hex graph in a 208px slot, then the legend.
 */
export const Allocation = ({ m }: { m: Model | undefined }) => (
  <section
    aria-label="Allocation"
    className="flex min-w-0 flex-col rounded-xl bg-white px-4 pt-5 pb-[14px] sm:px-6"
  >
    <RailHead title="Allocation" meta={m && m.assets > 0 ? usd(m.assets) : undefined} />
    <div className="mt-[25px]">
      {!m ? (
        <Skeleton className="h-[208px] w-full" />
      ) : m.assets === 0 ? (
        <div className="grid min-h-[200px] place-items-center rounded-lg bg-ds-panel px-6 py-8 text-center">
          <div>
            <p className="text-[14px] leading-none font-medium text-ds-ink">Nothing to show yet</p>
            <p className="mx-auto mt-2.5 max-w-[34ch] text-[12px] leading-[1.45] text-ds-muted">
              Add cash or buy a stock, and this shows where your money sits.
            </p>
          </div>
        </div>
      ) : (
        <HexAllocation slices={slicesOf(m)} total={m.assets} />
      )}
    </div>
  </section>
);
