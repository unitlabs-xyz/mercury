import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { OfferQueueDecision, ExecuteDecision, PricedCandidate, RefuseDecision } from "@mercury/core";
import { Dialog } from "../ui/Dialog";
import { Alert, Clock } from "../ui/icons";
import { Mark } from "./invest/shared";
import { RouteLine, SwapPanel, TipLine, Well } from "./review";
import { InfoTip, StatusChip } from "../ui/ds";
import { localTime } from "../ui/localTime";
import { lendableIssuer, TOKEN_NAME, useHeldAs } from "./stock/heldAs";
import type { Issuer } from "@mercury/types";
import { useMoney } from "../api/hooks";
import { PriceMoved, useOrderAction } from "../api/orders";
import { Button } from "../ui/Button";
import { useDecision } from "../market/hooks";
import { feeLines, type Charge } from "./fee-lines";
import type { Instrument, PriceMap } from "../market/hooks";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : null);

/* ── the three outcomes ─────────────────────────────────────────────── */

/** The quotes a person can choose between: every token that fills this amount, cheapest (or best-paying) first. */
const optionsOf = (d: ExecuteDecision): PricedCandidate[] =>
  d.candidates
    .filter((c) => c.viable && c.pricePerShare !== null && c.filledShares !== null)
    .sort((a, b) => {
      const pa = num(a.pricePerShare) ?? 0;
      const pb = num(b.pricePerShare) ?? 0;
      return d.side === "buy" ? pa - pb : pb - pa;
    });

/** Tokens quoted but unable to fill this amount: still offered as a row, so the choice is visible, but not pickable. */
const unavailableOf = (d: ExecuteDecision): PricedCandidate[] =>
  d.candidates.filter((c) => !(c.viable && c.pricePerShare !== null && c.filledShares !== null));

/** Why a token cannot take this order, in a reader's words. */
type AcceptImpact = ((accepted: boolean) => void) | undefined;

const whyUnavailable = (c: PricedCandidate) =>
  c.rejection === "impact_too_high"
    ? `Too little liquidity for this amount${
        c.priceImpact === null
          ? ""
          : ` · ${(Math.abs(num(c.priceImpact) ?? 0) * 100).toFixed(1)}% price impact`
      }`
    : "No route for this amount right now";

/**
 * Which token to buy or sell, when there is more than one. A row per token in
 * a grey panel, the chosen one raised in white: its name, whether it can back
 * a loan (only where Kamino lends against the stock at all), and on the right
 * what this amount gets from it. The best price is chosen to start with.
 */
const TokenChoice = ({
  options,
  unavailable,
  picked,
  onPick,
  selling,
  amount,
  fee,
  accepted,
  heldShares,
  onAcceptImpact,
}: {
  onAcceptImpact?: AcceptImpact;
  options: readonly PricedCandidate[];
  unavailable: readonly PricedCandidate[];
  picked: PricedCandidate;
  onPick: (mint: string) => void;
  selling: boolean;
  amount: number;
  fee: number;
  accepted: boolean | null;
  /** What is held of each token, by issuer, for a sell. */
  heldShares: ReadonlyMap<Issuer, number>;
}) => {
  const best = options[0];
  return (
    <fieldset className="rounded-lg bg-ds-panel p-1">
      <legend className="sr-only">{selling ? "Sell from" : "Buy as"}</legend>
      <p className="px-4 pt-3 pb-2.5 text-[12px] leading-none text-ds-muted">
        {selling ? "Sell from" : "Buy as"}
      </p>
      <div className="flex flex-col gap-1">
        {options.map((c) => {
          const on = c.mint === picked.mint;
          const price = num(c.pricePerShare) ?? 0;
          const filled = num(c.filledShares) ?? 0;
          const lendable = lendableIssuer(c.issuer);
          const held = heldShares.get(c.issuer);
          return (
            <label
              key={c.mint}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-4 py-3 transition-colors ${
                on ? "bg-white" : "hover:bg-white/60"
              }`}
            >
              <input
                type="radio"
                name="token"
                value={c.mint}
                checked={on}
                onChange={() => onPick(c.mint)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                  on ? "border-ds-ink" : "border-ds-divider bg-white"
                }`}
              >
                {on && <span className="size-2 rounded-full bg-ds-ink" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[14px] leading-[18px] font-medium text-ds-ink">
                  {TOKEN_NAME[c.issuer]}
                  {c.mint === best?.mint && options.length > 1 && (
                    <StatusChip tone="up">Best price</StatusChip>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-ds-muted">
                  {selling && held !== undefined ? `${held.toFixed(4)} shares held` : `${usd(price)} a share`}
                  {accepted === true && (
                    <>
                      {" · "}
                      {lendable ? "Borrowable" : "Not borrowable"}
                      {!lendable && (
                        <InfoTip label="About borrowing" align="start">
                          Shares on {TOKEN_NAME[c.issuer]} aren’t borrowable. Shares on xStocks can back a
                          loan.
                        </InfoTip>
                      )}
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right text-[14px] leading-[18px] font-medium text-ds-ink">
                {selling
                  ? usd(Math.max(0, filled * price - fee))
                  : `${((amount - fee) / price).toFixed(4)} sh`}
              </span>
            </label>
          );
        })}
        {unavailable.map((c) => {
          /* Priced out, not routeless: the cost is knowable, so it is offered rather than withheld. */
          const choosable = c.rejection === "impact_too_high" && onAcceptImpact !== undefined;
          return (
            <div
              key={c.mint}
              className="flex items-center gap-3 rounded-md px-4 py-3"
              aria-disabled={choosable ? undefined : "true"}
            >
              <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-ds-divider" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-[18px] font-medium text-ds-muted">
                  {TOKEN_NAME[c.issuer]}
                </span>
                <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">{whyUnavailable(c)}</span>
              </span>
              {choosable ? (
                <button
                  type="button"
                  onClick={() => onAcceptImpact(true)}
                  className="shrink-0 text-[12px] leading-none font-medium text-ds-link hover:opacity-80"
                >
                  Use anyway
                </button>
              ) : (
                <span className="shrink-0 text-[12px] leading-none text-ds-muted">Unavailable</span>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
};

/**
 * A fill, laid out as a swap: what leaves on the left, what arrives on the
 * right, then in the same grey panel the facts nothing else here
 * holds — the price against a real share, and which issuer and venue won.
 * Every figure is of the token picked above it, not only of the best one.
 */
const Execute = ({
  d,
  pick,
  amount,
  fee,
  charge,
}: {
  d: ExecuteDecision;
  pick: PricedCandidate;
  amount: number;
  fee: number;
  /** `fee` by part. Null before the quote arrives, when there is nothing to break down. */
  charge: Charge | null;
}) => {
  const selling = d.side === "sell";
  const sold = num(pick.filledShares) ?? 0;
  const price = num(pick.pricePerShare) ?? 0;
  const fair = num(d.fairPricePerShare) ?? 0;
  const premium = fair > 0 ? (price / fair - 1) * 100 : 0;
  /* The floor the route will not fill below; what moves while a buy lands is the share count. */
  const worst = num(pick.worstPricePerShare);
  /* The charge comes out of the amount, so a buyer holding exactly $5 can still spend all of it. */
  const invested = amount - fee;
  const shares = price > 0 ? invested / price : 0;
  /* Net of the charge, so the figure is the figure that lands. */
  const proceeds = Math.max(0, sold * price - fee);
  const atLeast =
    !selling && worst && worst > price
      ? `At least ${(invested / worst).toFixed(4)}`
      : selling && worst && worst < price
        ? `At least ${usd(Math.max(0, sold * worst - fee))}`
        : undefined;
  return (
    <>
      <SwapPanel
        from={
          selling ? (
            <Well label="You sell" value={sold.toFixed(4)} unit="shares" sub={`Worth ${usd(sold * price)}`} />
          ) : (
            <Well label="You pay" value={usd(amount)} unit="USD" />
          )
        }
        to={
          selling ? (
            <Well label="You get" value={usd(proceeds)} unit="USD" sub={atLeast} />
          ) : (
            <Well label="You get" value={shares.toFixed(4)} unit="shares" sub={atLeast} />
          )
        }
      >
        <dl className="flex flex-col gap-3">
          <TipLine
            k="Price per share"
            tip={
              Math.abs(premium) < 0.01
                ? "In line with the real share price."
                : `${Math.abs(premium).toFixed(2)}% ${premium > 0 ? "above" : "below"} the real share price.`
            }
          >
            {usd(price)}
          </TipLine>
          {charge !== null &&
            feeLines(charge, { selling, amount, invested }).map((line) => (
              <TipLine key={line.key} k={line.label} tip={line.tip}>
                {usd(line.value)}
              </TipLine>
            ))}
          <RouteLine issuer={TOKEN_NAME[pick.issuer]} venues={pick.routeLabels} />
        </dl>
      </SwapPanel>
      {d.warning && pick.mint === d.best.mint && (
        <p className="mt-1 flex gap-2 rounded-lg bg-ds-warn-chip px-4 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn">
          <Alert className="mt-px size-3.5 shrink-0" />
          {d.warning}
        </p>
      )}
    </>
  );
};

const Queue = ({ d, amount }: { d: OfferQueueDecision; amount: number }) => {
  const price = num(d.best.pricePerShare) ?? 0;
  const premium = (num(d.premium) ?? 0) * 100;
  const trigger = num(d.suggestedTriggerPricePerShare) ?? 0;
  return (
    <>
      <div className="rounded-lg bg-ds-warn-chip px-4 py-4 text-ds-chip-warn">
        <p className="flex items-center gap-2 text-[14px] leading-[1.35] font-medium">
          <Clock className="size-4" />
          Worth waiting
        </p>
        {/* This used to end "We can hold your order and place it when the price
            comes back", which is a trigger order — something we do not build
            yet. A panel that offers it above a button that cannot do it is the
            worst of both. What is true is the advice. */}
        <p className="mt-2 text-[12px] leading-[1.5]">
          The US market is shut, and this is trading {premium.toFixed(2)}% above the real share price — more
          than we think you should pay. The gap usually closes once the market opens.
        </p>
      </div>
      <dl className="mt-5 flex flex-col gap-3 px-1">
        <Line k="You'd pay now" v={`${usd(price)} per share`} />
        <Line k="Worth paying" v={`${usd(trigger)} per share`} sub="Around what it should cost" />
        <Line k="Your amount" v={usd(amount)} />
        <Line
          k="Latest"
          v={
            d.marketOpensAt
              ? `${localTime(d.marketOpensAt, { weekday: "long" }).replace(/^(\w+), /, "$1 at ")}, when the US market opens`
              : "When the US market opens"
          }
        />
      </dl>
      <p className="mt-3 px-1 text-[12px] leading-[1.45] text-ds-muted">
        Your cash stays yours in the meantime, and keeps earning.
      </p>
    </>
  );
};

/* The refusal copy lives in `@mercury/view`, so the phone says the same thing. */
export { REFUSE_COPY, refuseCopy } from "@mercury/view";
import { refuseCopy } from "@mercury/view";

const Refuse = ({ d }: { d: RefuseDecision }) => {
  const copy = refuseCopy(d.reason, d.side);
  return (
    <div className="rounded-lg bg-ds-down-chip px-4 py-4 text-ds-chip-down">
      <p className="text-[14px] leading-[1.35] font-medium">{copy.title}</p>
      <p className="mt-2 text-[12px] leading-[1.5]">{copy.body}</p>
    </div>
  );
};

/* The rail's figure row (stock/Panels `RailLine`), with room for a note under the value. */
const Line = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
  <div className="flex items-baseline justify-between gap-4 text-[14px] leading-5">
    <dt className="text-ds-muted">{k}</dt>
    <dd className="text-right">
      <span className="block font-medium text-ds-ink">{v}</span>
      {sub && <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">{sub}</span>}
    </dd>
  </div>
);

/* ── the sheet ──────────────────────────────────────────────────────── */

/**
 * The order, done. The stock's mark with a green tick on it says what happened at a glance; the
 * figures underneath sit on the grey panel as rail lines, read off the chain, not the quote. Its
 * parts arrive a beat apart (the launch film plays the same thing).
 */
const placedItem = {
  hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.25, 0.8, 0.3, 1] } },
} as const;

const PlacedLine = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <motion.div
    variants={placedItem}
    className="flex h-5 items-center justify-between text-[14px] leading-none"
  >
    <span className="text-ds-muted">{label}</span>
    <span className="font-medium text-ds-ink">{children}</span>
  </motion.div>
);

const Placed = ({
  selling,
  instrument,
  shares,
  pricePerShare,
  total,
  realisedPnlUsd,
  onDone,
}: {
  selling: boolean;
  instrument: Instrument;
  shares: number;
  pricePerShare: number;
  /** What actually moved, from the order: shares × price would round a cent off. */
  total: number;
  realisedPnlUsd: number | null;
  onDone: () => void;
}) => (
  <motion.div
    initial="hidden"
    animate="shown"
    transition={{ staggerChildren: 0.06 }}
    className="px-5 pt-6 pb-5"
  >
    {/* The mark, big, with the tick on it; what happened beside it, as on the review sheet. */}
    <div className="flex items-center gap-3">
      {/* The mark slides in from the right, growing out from its left edge; then the badge lands, then the tick draws. */}
      <motion.div
        initial={{ x: 24, scale: 0.55, opacity: 0, filter: "blur(4px)" }}
        animate={{ x: 0, scale: 1, opacity: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        style={{ transformOrigin: "0% 50%" }}
        className="relative size-[42px] shrink-0"
      >
        <Mark i={instrument} size={42} />
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 420, damping: 18 }}
          className="absolute -right-[3px] -bottom-[3px] grid size-[18px] place-items-center rounded-full bg-ds-up ring-2 ring-white"
        >
          <svg viewBox="0 0 24 24" width={10} height={10} fill="none" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.45, duration: 0.35, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        </motion.span>
      </motion.div>
      <div className="min-w-0">
        <motion.h2
          variants={placedItem}
          id="order-title"
          className="truncate text-[18px] leading-none font-medium text-ds-ink"
        >
          {selling ? "Sold" : "Bought"} {instrument.name}
        </motion.h2>
        <motion.p variants={placedItem} className="mt-1.5 text-[14px] leading-none text-ds-muted">
          {selling ? "The money is in your cash." : "It's in your portfolio."}
        </motion.p>
      </div>
    </div>
    <motion.div
      variants={placedItem}
      transition={{ staggerChildren: 0.05, delayChildren: 0.05 }}
      className="mt-5 grid gap-3 rounded-lg bg-ds-panel px-4 py-4"
    >
      <PlacedLine label="Shares">{shares.toFixed(4)}</PlacedLine>
      <PlacedLine label="Price per share">{usd(pricePerShare)}</PlacedLine>
      <PlacedLine label={selling ? "You got" : "You paid"}>{usd(total)}</PlacedLine>
      {/* A sale is the one moment in this product where a gain stops being a number on a screen
          and becomes money. Worth saying. */}
      {realisedPnlUsd !== null && (
        <PlacedLine label={realisedPnlUsd < 0 ? "Realised loss" : "Realised gain"}>
          <span className={realisedPnlUsd < 0 ? "text-ds-down" : "text-ds-up"}>
            {usd(Math.abs(realisedPnlUsd))}
          </span>
        </PlacedLine>
      )}
    </motion.div>
    <motion.div variants={placedItem}>
      <Button variant="primary" size="lg" onClick={onDone} className="mt-5 w-full">
        Done
      </Button>
    </motion.div>
  </motion.div>
);

export const OrderSheet = ({
  instrument,
  prices,
  open,
  onClose,
  onPlaced,
  initial,
  side = "buy",
  max = false,
  acceptImpact = false,
  onAcceptImpact,
}: {
  instrument: Instrument;
  prices: PriceMap | undefined;
  open: boolean;
  onClose: () => void;
  /** The order went through and the sheet is closing: what the ticket held has been answered. */
  onPlaced?: () => void;
  /** Carried from the ticket, where the impact was shown and accepted. */
  acceptImpact?: boolean;
  onAcceptImpact?: (accepted: boolean) => void;
  /** The amount already typed on the page, so confirming never means typing it twice. */
  initial?: number | undefined;
  side?: "buy" | "sell";
  /** Sell the whole position, in tokens. The amount is then only a display figure. */
  max?: boolean;
}) => {
  const selling = side === "sell";
  const liveAvailable = Number(useMoney().data?.balanceUsd ?? 0);
  const heldAs = useHeldAs(instrument.ticker);
  const [raw, setRaw] = useState("100");
  const buy = useOrderAction();
  const placed = buy.data ?? null;

  const amount = Number(raw) || 0;

  useEffect(() => {
    if (open && initial) setRaw(String(initial));
  }, [open, initial]);

  // Quoting on every keystroke would hammer a free endpoint and flicker the
  // numbers while someone is still typing. Settle first, then quote.
  const [settled, setSettled] = useState(amount);
  useEffect(() => {
    const t = setTimeout(() => setSettled(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);

  const working = buy.isPending;
  const live = useDecision(open ? instrument : undefined, settled, prices, {
    side,
    max,
    acceptImpact,
    paused: working,
  });
  /*
   * The quote that was pressed, held for as long as the order is in flight.
   *
   * The quote kept refreshing underneath a sale — on its own timer, and
   * whenever the ticket behind the sheet refreshed the same cached answer. Once
   * the shares had left the wallet but before the server said so, the fresh
   * quote was a refusal, and the sheet flashed "You don't hold this stock" at
   * someone whose sale was going through. What is on screen while it sends is
   * what they agreed to. A failure lets go, and shows the quote as it is now.
   */
  /* The cash and the shares are held with it: both drop the moment the order lands on chain. */
  const liveHeldShares = new Map((heldAs.parts ?? []).map((p) => [p.issuer, p.shares - p.pledged] as const));
  const [sent, setSent] = useState<{
    decision: typeof live.decision;
    fee: typeof live.fee;
    charge: typeof live.charge;
    available: number;
    heldShares: typeof liveHeldShares;
  } | null>(null);
  const held = working && sent !== null;
  const decision = held ? sent.decision : live.decision;
  const fee = held ? sent.fee : live.fee;
  const charge = held ? sent.charge : live.charge;
  const available = held ? sent.available : liveAvailable;
  const heldShares = held ? sent.heldShares : liveHeldShares;
  const isLoading = held ? false : live.isLoading;
  /* Which token to trade. Null is the best price; a pick only holds while that token is still on offer. */
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [open, side]);
  const options = decision?.kind === "execute" ? optionsOf(decision) : [];
  const unavailable = decision?.kind === "execute" ? unavailableOf(decision) : [];
  const pick =
    decision?.kind === "execute" ? (options.find((c) => c.mint === picked) ?? decision.best) : null;
  /* The whole charge: the network cost and Mercury's fee, both taken from the amount or the proceeds. */
  const feeUsd = fee === null ? 0 : Number(fee.toString());

  const typing = settled !== amount;
  /* A sale is not spending, so the cash balance has nothing to say about it. */
  const overBalance = !selling && amount > available;
  /*
   * `offer_queue` blocks the button. The decision means the market is shut and
   * the price is far enough above fair that we decline to fill it; the answer
   * `decide` offers is a trigger order, which does not exist. Sending it anyway
   * would reach the server and come back refused every single time.
   */
  const blocked =
    working ||
    amount <= 0 ||
    overBalance ||
    !decision ||
    decision.kind !== "execute" ||
    typing ||
    isLoading ||
    !buy.walletReady;

  // The price moved between the quote we showed and the one the server would
  // fill at. Not an error so much as a question, so it reads as one.
  const moved = buy.error instanceof PriceMoved ? buy.error : null;
  const failed = buy.error !== null && moved === null ? buy.error : null;

  /*
   * Two labels, and a spinner for everything in between.
   *
   * This read out five more: the wallet hydrating, the quote arriving, and then
   * each internal step of the order — pricing, building, signing, sending,
   * recording. They named things that are not decisions anybody makes, and the
   * naming was upside down: those five churned across the parts that take a few
   * hundred milliseconds each and then held still on the send, which waits on
   * confirmation for as long as it takes. Motion where nothing waited, stillness
   * where everything did.
   *
   * Two of them were saying the body's job over again — `offer_queue` and
   * `refuse` each render a panel directly above this button explaining exactly
   * what is wrong. And one was simply false: "Waiting for your approval" named
   * the Privy sheet, which ADR 0012 removed.
   *
   * A moved price stays, because it is not a status. It is a different offer,
   * and pressing it means agreeing to a number that changed.
   */
  const cta = moved ? `${selling ? "Sell" : "Buy"} at the new price` : selling ? "Sell now" : "Buy now";

  /* Not while the order is in flight: resetting would drop its result, and the
     ticket would never hear that it went through. */
  const close = () => {
    if (working) return;
    buy.reset();
    if (placed) onPlaced?.();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="order-title"
      className="flex max-h-[min(86vh,780px)] max-w-[480px] flex-col rounded-xl! p-1"
    >
      {placed ? (
        <Placed
          selling={selling}
          instrument={instrument}
          shares={Number(placed.shares)}
          pricePerShare={Number(placed.pricePerShare)}
          total={Number(placed.usd)}
          realisedPnlUsd={placed.realisedPnlUsd === null ? null : Number(placed.realisedPnlUsd)}
          onDone={close}
        />
      ) : (
        <>
          {/* The amount well runs to 4px from the sheet's edge, as on the rail cards; everything else sits 20px in. */}
          <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-5">
            {/* A review, not a second ticket: the amount was chosen on the page, so it is shown, not asked
                for again. Cancel goes back to change it. */}
            <div className="flex items-center gap-3 px-5">
              <Mark i={instrument} size={40} />
              <div className="min-w-0">
                <h2 id="order-title" className="truncate text-[18px] leading-none font-medium text-ds-ink">
                  {selling ? "Sell" : "Buy"} {instrument.name}
                </h2>
                <p className="mt-2 truncate text-[14px] leading-none text-ds-muted">
                  {instrument.ticker}
                  {selling ? "" : ` · ${usd(available)} available`}
                </p>
              </div>
            </div>
            {/* The fill says the amount itself, in the swap; until there is one, the amount stands alone. */}
            {decision?.kind !== "execute" && (
              <p className="mt-5 px-5 text-[36px] leading-none font-medium text-ds-ink">
                {selling && max ? "All shares" : usd(amount)}
              </p>
            )}

            {overBalance && (
              <p className="mx-5 mt-3 text-[12px] leading-[1.45] text-ds-chip-down">
                That is more than your {usd(available)} cash. Add money first.
              </p>
            )}

            {moved && (
              <p
                role="alert"
                className="mx-5 mt-3 flex gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn"
              >
                <Alert className="mt-px size-3.5 shrink-0" />
                The price moved while you were deciding, so we stopped rather than buy at it. Buying again
                uses the price below.
              </p>
            )}
            {failed && (
              <p
                role="alert"
                className="mx-5 mt-3 flex gap-2 rounded-lg bg-ds-down-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-down"
              >
                <Alert className="mt-px size-3.5 shrink-0" />
                {failed.message}
              </p>
            )}

            <div className="mt-5 [&>.box]:mx-4">
              {!decision ? (
                <div className="box rounded-lg bg-ds-panel px-4 py-4">
                  <p className="text-[14px] leading-none font-medium text-ds-ink">
                    {typing ? "Pricing\u2026" : "Quoting every issuer\u2026"}
                  </p>
                  <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
                    Routes are quoted for this exact amount, so the answer changes with the number.
                  </p>
                </div>
              ) : (
                <>
                  {decision.kind === "execute" && pick && (
                    <div className="flex flex-col gap-1">
                      {options.length + unavailable.length > 1 && (
                        <TokenChoice
                          options={options}
                          unavailable={unavailable}
                          picked={pick}
                          onPick={setPicked}
                          selling={selling}
                          amount={settled}
                          fee={feeUsd}
                          accepted={heldAs.accepted}
                          heldShares={heldShares}
                          {...(onAcceptImpact ? { onAcceptImpact } : {})}
                        />
                      )}
                      <Execute d={decision} pick={pick} amount={settled} fee={feeUsd} charge={charge} />
                    </div>
                  )}
                  {decision.kind === "offer_queue" && (
                    <div className="px-4">
                      <Queue d={decision} amount={settled} />
                    </div>
                  )}
                  {decision.kind === "refuse" && (
                    <div className="px-4">
                      <Refuse d={decision} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2.5 bg-white px-5 pt-1 pb-4">
            {/* The design system's buttons. These were hand-rolled: a teal
                rectangle at h-11 for the primary action, where every other
                button in the app is a near-black pill at h-10. */}
            <Button size="lg" onClick={close} disabled={working} className="flex-1">
              Cancel
            </Button>
            <Button
              size="lg"
              variant="primary"
              disabled={blocked}
              loading={working}
              onClick={() => {
                setSent({
                  decision: live.decision,
                  fee: live.fee,
                  charge: live.charge,
                  available: liveAvailable,
                  heldShares: liveHeldShares,
                });
                buy.mutate({
                  ticker: instrument.ticker,
                  side,
                  usd: settled,
                  ...(max ? { max: true } : {}),
                  /* The token reviewed, picked or best: the server fills only that one. */
                  ...(pick ? { issuer: pick.issuer } : {}),
                  ...(acceptImpact ? { acceptImpact: true } : {}),
                });
              }}
              className="flex-[1.6]"
            >
              {cta}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
};
