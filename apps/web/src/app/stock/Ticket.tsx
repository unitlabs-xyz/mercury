import { DEFAULT_POLICY, type Decision } from "@mercury/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button";
import { RailHead } from "../../ui/ds";
import { Alert, Clock } from "../../ui/icons";
import { REFUSE_COPY, refuseCopy } from "../OrderSheet";
import { pct, usd } from "@mercury/view";
import { RailLine } from "./Panels";
import { usePanels } from "../Panels";

type Side = "buy" | "sell";

/* Three amounts. Max, the cash on hand, sits in the field rather than with them. */
const BUY_PRESETS = [50, 100, 250];

const MIN_ORDER_USD = DEFAULT_POLICY.minOrderUsd.toNumber();

/**
 * Fractions when selling, not dollars.
 *
 * A $50 chip is dead furniture on a $30 position, and it is dead exactly when
 * the position is small — which is most of them. A quarter of what you hold
 * means something at every size.
 */
const SELL_PRESETS = [0.25, 0.5, 0.75] as const;

export const chip = (on: boolean) =>
  `h-8 rounded-md border text-[14px] leading-none text-ds-ink transition-colors max-sm:h-10 disabled:opacity-40 ${
    on ? "border-black/10 bg-linear-to-b from-white to-[#eeeeee]" : "border-transparent hover:bg-white/70"
  }`;

/**
 * Buy or sell, as one control rather than two buttons.
 *
 * Rendered only for someone who holds the stock. A visitor reading the page of
 * a stock they own none of has nothing to sell, and a dead tab is furniture.
 */
const SideTabs = ({ side, onSide }: { side: Side; onSide: (s: Side) => void }) => (
  <div
    className="mt-[11px] grid grid-cols-2 gap-1 rounded-lg bg-ds-panel p-1"
    role="group"
    aria-label="Buy or sell"
  >
    {(["buy", "sell"] as const).map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => onSide(s)}
        aria-pressed={side === s}
        className={`h-9 rounded-md text-[14px] leading-none font-medium capitalize transition-colors ${
          side === s
            ? "bg-white text-ds-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            : "text-ds-muted hover:text-ds-ink"
        }`}
      >
        {s}
      </button>
    ))}
  </div>
);

const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : null);

/**
 * A note above the button: a light tint, 12px, the icon beside the copy.
 *
 * The copy is ink rather than the tint's own colour. Body text in #b33d29 on a
 * red field is three reds saying one thing, and it shouted in a page that
 * otherwise speaks quietly. The icon carries the signal; the words are read.
 */
export const Note = ({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "down";
  icon: ReactNode;
  children: ReactNode;
}) => (
  <p
    className={`mx-5 mt-4 flex gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-[1.45] ${
      tone === "warn"
        ? "bg-ds-warn-chip text-ds-ink [&_svg]:text-ds-chip-warn"
        : "bg-ds-down-chip text-ds-ink [&_svg]:text-ds-chip-down"
    } [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0`}
  >
    {icon}
    <span>{children}</span>
  </p>
);

/**
 * The amount, in a white well on the grey panel 4px in from the card's edge,
 * with the presets under it. The stock ticket and the basket ticket share it.
 *
 * Max sits in the field, as it does on the swap: it is the answer to "how much
 * can I put here", which is a question about the field, not one more preset.
 */
export const AmountWell = ({
  raw,
  onRaw,
  side = "buy",
  positionUsd = null,
  max = false,
  onMax,
  cash = null,
}: {
  raw: string;
  onRaw: (v: string) => void;
  side?: Side;
  /** What the whole position is worth, which the fractions are of. */
  positionUsd?: number | null;
  max?: boolean;
  onMax?: (v: boolean) => void;
  /** Cash on hand: what Max fills in on a buy. Null until it is known, which hides Max. */
  cash?: number | null;
}) => {
  const amount = Number(raw) || 0;
  /* Down to the cent, never up: a rounded-up Max would be more than the cash. */
  const allCash = cash === null ? 0 : Math.floor(cash * 100) / 100;
  const selling = side === "sell";
  /*
   * On a sale Max is "everything", not a dollar figure: the server sells the
   * whole position rather than what it was worth when the price was read, so
   * nothing is left behind as dust. On a buy it is the cash, to the cent.
   */
  const canMax = selling ? positionUsd !== null && positionUsd > 0 : allCash > 0;
  const maxOn = selling ? max : allCash > 0 && amount === allCash;

  return (
    <div className="mt-[11px] rounded-lg bg-ds-panel p-1">
      <label className="flex h-15 items-center gap-2 rounded-md bg-white px-4 outline-offset-0 focus-within:outline-1 focus-within:outline-black/10">
        <span className="-mr-1 text-[28px] leading-none font-medium text-ds-muted">$</span>
        <input
          value={raw}
          onChange={(e) => {
            /* Typing a figure is choosing a figure, so it cannot still be
               "everything" — the server would ignore what was typed. */
            onMax?.(false);
            onRaw(e.target.value.replace(/[^0-9.]/g, ""));
          }}
          inputMode="decimal"
          aria-label="Amount in dollars"
          className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none"
        />
        {/* Nothing to offer before the cash or the position is known, and
            offering zero would be a number we made up. */}
        {canMax && (
          <button
            type="button"
            onClick={() => {
              if (selling) {
                onMax?.(true);
                onRaw((positionUsd ?? 0).toFixed(2));
              } else onRaw(allCash.toFixed(2));
            }}
            aria-label={selling ? "Sell all" : "Max, all your cash"}
            aria-pressed={maxOn}
            className={`h-[26px] shrink-0 rounded-full border px-3 text-[12px] leading-none transition-colors ${
              maxOn
                ? "border-ds-ink bg-ds-ink text-white"
                : "border-black/10 bg-linear-to-b from-white to-[#eeeeee] text-ds-ink"
            }`}
          >
            Max
          </button>
        )}
        <span className="shrink-0 text-[12px] text-ds-muted">USD</span>
      </label>
      <div className="mt-1 grid grid-cols-3 gap-1" role="group" aria-label="Amount presets">
        {selling
          ? SELL_PRESETS.map((f) => {
              const value = positionUsd === null ? 0 : Number((positionUsd * f).toFixed(2));
              const on = !max && value > 0 && amount === value;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={positionUsd === null}
                  onClick={() => {
                    onMax?.(false);
                    onRaw(String(value));
                  }}
                  aria-pressed={on}
                  className={chip(on)}
                >
                  {f * 100}%
                </button>
              );
            })
          : BUY_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onRaw(String(p))}
                aria-pressed={amount === p}
                className={chip(amount === p)}
              >
                ${p}
              </button>
            ))}
      </div>
    </div>
  );
};

/**
 * The order, on the page rather than behind a button, as a rail card: the
 * amount in a white well on the grey panel with the presets under it, the one
 * thing that follows from it, then the one primary action. Review opens the
 * confirmation with the same figure.
 *
 * It used to carry the winning issuer and the price impact as well, which are
 * the table's two comparison columns restated — and on a wide screen the two
 * cards are level, so those numbers were on screen twice at once. The table
 * compares the issuers; the ticket answers what this amount buys.
 *
 * The price per share stays, even though the table shows it too. The ticket is
 * sticky and the table is not, so for most of the page this is the only place
 * the price of the order appears — and the figure in the header is the real
 * share price, which is a different number from what this order pays.
 */
export const Ticket = ({
  name,
  raw,
  onRaw,
  settled,
  cash,
  decision,
  quoting,
  fair,
  onReview,
  side,
  onSide,
  holds,
  shares,
  sellableShares,
  pledgedShares,
  positionUsd,
  sellableUsd,
  proceeds,
  max,
  onMax,
  acceptImpact,
  onAcceptImpact,
}: {
  name: string;
  raw: string;
  onRaw: (v: string) => void;
  /** The amount once typing pauses: the quote, and every figure read from it, follow this. */
  settled: number;
  cash: number | null;
  decision: Decision | null;
  /** The person has seen what this size does to the price and asked for it anyway. */
  acceptImpact: boolean;
  onAcceptImpact: (accepted: boolean) => void;
  quoting: boolean;
  fair: number | null;
  onReview: () => void;
  side: Side;
  onSide: (s: Side) => void;
  /** Whether the tabs appear at all. Any holding counts, pledged included. */
  holds: boolean;
  shares: number | null;
  /** Shares less what Kamino is holding as collateral. */
  sellableShares: number | null;
  pledgedShares: number | null;
  positionUsd: number | null;
  /** What the sellable part of it is worth. Less than the position when some
      of it is pledged, and the number every figure a sell offers is of. */
  sellableUsd: number | null;
  proceeds: number | null;
  max: boolean;
  onMax: (v: boolean) => void;
}) => {
  const amount = Number(raw) || 0;
  const selling = side === "sell";
  /*
   * The route the order would take. A refusal on impact still has one — the
   * cost is the whole point of the choice — so the ticket shows what it would
   * do rather than dashes above a warning about it.
   */
  const impactRefused = decision?.kind === "refuse" && decision.reason === "impact_too_high";
  const best =
    decision === null
      ? null
      : decision.kind !== "refuse"
        ? decision.best
        : impactRefused
          ? ([...decision.candidates]
              .filter((c) => c.pricePerShare !== null && c.priceImpact !== null)
              .sort((a, b) => Number(a.priceImpact) - Number(b.priceImpact))[0] ?? null)
          : null;
  const price = num(best?.pricePerShare) ?? fair;
  const filled = num(best?.filledShares);
  const over = selling ? sellableUsd !== null && amount > sellableUsd : cash !== null && amount > cash;
  /* Some of it is collateral, but not all: the ticket offers the rest, and has
     to say why the rest is not the whole. */
  const partlyPledged = selling && (pledgedShares ?? 0) > 0 && (sellableShares ?? 0) > 0;
  /* Held, but every share of it is collateral. Hiding the tab would leave
     someone who can see their shares unable to find out why they cannot sell. */
  const allPledged = selling && (sellableShares ?? 0) <= 0 && (pledgedShares ?? 0) > 0;

  /*
   * Whether the note belongs under the amount or above the button.
   *
   * The test is whether typing a different number fixes it. Too small, or more
   * than you hold, are both answered by the field directly above — so they sit
   * with it, quietly, and the disabled button is the consequence rather than
   * the thing being explained. A halt, a stale price or a market with no depth
   * are not the amount's fault and still take the note above the button.
   */
  /* Checked here before anything is asked: under $5 no quote is fetched, so there is no refusal to wait for. */
  /*
   * What the move costs, from the route that would be used: the cheapest impact
   * among the candidates that have one, which is the order the server ranks first.
   */
  const impacts = (decision?.candidates ?? [])
    .map((c) => (c.priceImpact === null ? null : Number(c.priceImpact)))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const impactPct = impacts.length > 0 ? Math.min(...impacts) * 100 : null;
  const impactUsd = impactPct === null || amount <= 0 ? null : (amount * impactPct) / 100;
  const tooSmall =
    (decision?.kind === "refuse" && decision.reason === "below_minimum") ||
    (!max && settled > 0 && settled < MIN_ORDER_USD);
  /* A buy over the cash on hand is not explained here: the button below
     becomes Add cash, which is both the explanation and the way out. */
  const needsCash = over && !selling;
  const panels = usePanels();
  const amountHint = over ? (
    selling ? (
      <>More than you can sell. The most is {usd(sellableUsd ?? 0)}.</>
    ) : null
  ) : tooSmall ? (
    REFUSE_COPY.below_minimum.body
  ) : null;

  return (
    <section aria-label={`${selling ? "Sell" : "Buy"} ${name}`} className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-3 sm:px-5 pt-4">
        <RailHead
          title={`${selling ? "Sell" : "Buy"} ${name}`}
          meta={
            selling
              ? shares === null
                ? undefined
                : /* Naming both, because the second is what every figure below
                     is of and it is not the number they hold. */
                  partlyPledged
                  ? `${(sellableShares ?? 0).toFixed(4)} of ${shares.toFixed(4)} shares · ${usd(sellableUsd ?? 0)}`
                  : `${shares.toFixed(4)} shares · ${usd(positionUsd ?? 0)}`
              : cash === null
                ? undefined
                : `${usd(cash)} cash`
          }
        />
      </div>

      {holds && <SideTabs side={side} onSide={onSide} />}

      <AmountWell
        raw={raw}
        onRaw={onRaw}
        side={side}
        positionUsd={sellableUsd}
        max={max}
        onMax={onMax}
        cash={cash}
      />

      {amountHint && <p className="mx-5 mt-2.5 text-[12px] leading-[1.45] text-ds-muted">{amountHint}</p>}

      <dl className="flex flex-col gap-3 px-5 pt-5">
        <RailLine k="Price per share">{price === null ? "—" : usd(price)}</RailLine>
        <RailLine k={selling ? "You sell" : "You get"}>
          {tooSmall
            ? "—"
            : quoting
              ? "Quoting…"
              : selling
                ? filled === null
                  ? "—"
                  : `${filled.toFixed(4)} shares`
                : price && settled > 0
                  ? `${(settled / price).toFixed(4)} shares`
                  : "—"}
        </RailLine>
        {/* Net of the charge, so the figure here is the figure that lands. */}
        {selling && (
          <RailLine k="You get">{tooSmall || quoting || proceeds === null ? "—" : usd(proceeds)}</RailLine>
        )}
      </dl>

      {/* Not an error, so it sits with the field rather than above the button:
          the amount is capped, and the cap is what wants explaining. */}
      {partlyPledged && !over && (
        <p className="mx-5 mt-2.5 text-[12px] leading-[1.45] text-ds-muted">
          {(pledgedShares ?? 0).toFixed(4)} of your shares are held as collateral on Kamino.{" "}
          <Link to="/money" className="font-medium text-ds-ink underline underline-offset-2">
            Withdraw them
          </Link>{" "}
          to sell more than {usd(sellableUsd ?? 0)}.
        </p>
      )}

      {/*
       * Always mounted, so a note that appears is read out: these change as the
       * amount is typed, and a region created along with its text is often
       * missed. Polite, because an alert would cut in on every keystroke.
       */}
      <div aria-live="polite">
        {allPledged && (
          <Note tone="warn" icon={<Alert />}>
            All {(pledgedShares ?? 0).toFixed(4)} of your shares are held as collateral on Kamino.{" "}
            <Link to="/money" className="font-medium text-ds-ink underline underline-offset-2">
              Withdraw them
            </Link>{" "}
            to sell.
          </Note>
        )}

        {/* Not "we can wait and place it when the price comes back": that is a
          trigger order, which is not built. Saying it here and then opening a
          dialog whose only button is dead spends a click to say no. */}
        {decision?.kind === "offer_queue" && (
          <Note tone="warn" icon={<Clock />}>
            Trading above the real share price, and the US market is shut. The gap usually closes once it
            opens.
          </Note>
        )}
        {decision?.kind === "refuse" && !tooSmall && decision.reason !== "impact_too_high" && (
          <Note tone="down" icon={<Alert />}>
            <span className="font-medium">{refuseCopy(decision.reason, decision.side).title}.</span>{" "}
            {refuseCopy(decision.reason, decision.side).body}
          </Note>
        )}
        {/*
         * Moving the price is a cost, not a prohibition. Refusing outright traps
         * anyone holding a token nobody trades, so the cost is named and the
         * choice is theirs — taken here, in one deliberate press.
         */}
        {impactRefused && !tooSmall && (
          <Note tone="warn" icon={<Alert />}>
            <span className="font-medium">
              {impactUsd === null
                ? "Thin trading at this size."
                : `Costs about ${usd(impactUsd)} in price impact.`}
            </span>{" "}
            {impactPct === null
              ? `${selling ? "Selling" : "Buying"} this much pushes the price against you.`
              : `Only ${pct(impactPct, 1)} of this order, but a smaller amount costs less.`}
          </Note>
        )}
        {acceptImpact && decision?.kind !== "refuse" && impactPct !== null && (
          <Note tone="warn" icon={<Alert />}>
            <span className="font-medium">
              {impactUsd === null ? "Price impact accepted." : `Paying about ${usd(impactUsd)} in impact.`}
            </span>{" "}
            {pct(impactPct, 1)} of this order, on top of the price above.{" "}
            <button
              type="button"
              onClick={() => onAcceptImpact(false)}
              className="font-medium text-ds-ink underline underline-offset-2 hover:opacity-80"
            >
              Undo
            </button>
          </Note>
        )}
      </div>
      <div className="px-5 pt-5 pb-5">
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            if (needsCash) return panels.addCash();
            /* Accepting is the press: the warning above already said what it costs. */
            if (impactRefused) onAcceptImpact(true);
            else onReview();
          }}
          disabled={
            needsCash
              ? false
              : (max ? false : amount <= 0) ||
                over ||
                tooSmall ||
                allPledged ||
                fair === null ||
                (decision?.kind === "refuse" && !impactRefused) ||
                /* A sell never queues — `decide` sees to that — but saying so here
               keeps the rule visible at the call site rather than implied. */
                (!selling && decision?.kind === "offer_queue")
          }
          className="w-full"
        >
          {needsCash ? "Add cash" : impactRefused ? (selling ? "Sell anyway" : "Buy anyway") : "Review order"}
        </Button>
      </div>
    </section>
  );
};
