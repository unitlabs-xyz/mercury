import { useEffect, useState } from "react";
import type { OfferQueueDecision, ExecuteDecision, RefuseDecision } from "@mercury/core";
import { Dialog } from "../ui/Dialog";
import { Alert, Check, Clock } from "../ui/icons";
import { useMoney } from "../api/hooks";
import { PriceMoved, STEP_LABEL, useBuyAction } from "../api/orders";
import { ISSUER_NAME } from "./IssuerCompare";
import { Button } from "../ui/Button";
import { useDecision } from "../market/hooks";
import type { Instrument, PriceMap } from "../market/hooks";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const PRESETS = [50, 100, 250, 500];

const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : null);

/* ── the three outcomes ─────────────────────────────────────────────── */

const Execute = ({ d, amount }: { d: ExecuteDecision; amount: number }) => {
  const price = num(d.best.pricePerShare) ?? 0;
  const premium = (num(d.premium) ?? 0) * 100;
  /*
   * The floor the route will not fill below. A buy spends a fixed number of
   * dollars, so what moves while the order lands is the number of shares that
   * come back — and until now that movement was allowed for in the quote,
   * bounded by the route, and named nowhere on screen. It is worth up to half
   * of the premium we promise to protect, so it gets a number.
   */
  const worst = num(d.best.worstPricePerShare);
  return (
    <>
      {/*
       * No "Ready to buy" banner: an enabled Buy now already says that, and a
       * green box saying the thing is fine is the kind of reassurance a product
       * gives instead of information.
       *
       * The two facts it did carry are kept, because nothing else here holds
       * them — which issuer won, and what this costs against a real share.
       */}
      <dl className="space-y-2.5 text-[14px]">
        <Line k="You pay" v={usd(amount)} />
        <Line
          k="Price per share"
          v={usd(price)}
          sub={
            Math.abs(premium) < 0.01
              ? "In line with the real share price"
              : `${Math.abs(premium).toFixed(2)}% ${premium > 0 ? "above" : "below"} the real share price`
          }
        />
        <Line
          k="Shares"
          v={(amount / price).toFixed(4)}
          {...(worst && worst > price
            ? { sub: `At least ${(amount / worst).toFixed(4)} if the price moves before it lands` }
            : {})}
        />
        {/* Not monospace: "Raydium CLMM" is the name of a venue, not a
            measurement. Mono here was a costume for "technical". */}
        <Line k="Route" v={`${ISSUER_NAME[d.best.issuer]} · ${d.best.routeLabels.join(" → ")}`} />
      </dl>
      {d.warning && (
        <p className="mt-4 flex gap-2 rounded-xl border border-warn-line bg-warn-tint px-3.5 py-3 text-[13px] leading-[1.5] text-warn">
          <Alert className="mt-px size-4 shrink-0" />
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
      <div className="rounded-xl border border-warn-line bg-warn-tint px-4 py-3.5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-warn">
          <Clock className="size-4" />
          Worth waiting
        </p>
        {/* This used to end "We can hold your order and place it when the price
            comes back", which is a trigger order — something we do not build
            yet. A panel that offers it above a button that cannot do it is the
            worst of both. What is true is the advice. */}
        <p className="mt-1 text-[13px] leading-[1.5] text-warn/90">
          The US market is shut, and this is trading {premium.toFixed(2)}% above the real share price — more
          than we think you should pay. The gap usually closes once the market opens.
        </p>
      </div>
      <dl className="mt-4 space-y-2.5 text-[14px]">
        <Line k="You'd pay now" v={`${usd(price)} per share`} />
        <Line k="Worth paying" v={`${usd(trigger)} per share`} sub="Around what it should cost" />
        <Line k="Your amount" v={usd(amount)} />
        <Line
          k="Latest"
          v={
            d.marketOpensAt
              ? `${d.marketOpensAt.toLocaleString("en-US", {
                  weekday: "long",
                  timeZone: "America/New_York",
                })} at ${d.marketOpensAt.toLocaleString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                })} ET, when the US market opens`
              : "When the US market opens"
          }
        />
      </dl>
      <p className="mt-4 text-[13px] leading-[1.5] text-muted">
        Your cash stays yours in the meantime, and keeps earning.
      </p>
    </>
  );
};

/*
 * Why an order will not go through, in the reader's words rather than ours.
 * "Route", "the pool", "slip", "liquidity", "the reference price" and
 * "ex-dividend" are how we describe the machinery; none of them tell someone
 * new to shares what happened or what to do next. Each one names the problem
 * and, where there is one, the way out.
 */
export const REFUSE_COPY: Record<RefuseDecision["reason"], { title: string; body: string }> = {
  below_minimum: { title: "Too small to buy", body: "The smallest order we can place is $5." },
  no_route: {
    title: "Can't buy this right now",
    body: "There isn't enough of it available to trade at the moment. Try again shortly.",
  },
  impact_too_high: {
    title: "This order would move the price",
    body: "At this size, buying would push the price up against you. Try a smaller amount, or wait until the US market opens.",
  },
  reference_stale: {
    title: "Price is out of date",
    body: "We can't confirm what a share is worth right now, so we're not placing orders. Try again in a moment.",
  },
  instrument_halted: { title: "Trading halted", body: "The exchange has halted this stock." },
  corp_action_pending: {
    title: "Dividend being applied",
    body: "Your share count is about to change. Buying reopens as soon as it has.",
  },
  no_candidates: { title: "Not available", body: "We don't offer this stock yet." },
};

const Refuse = ({ d }: { d: RefuseDecision }) => {
  const copy = REFUSE_COPY[d.reason];
  return (
    <div className="rounded-xl border border-down-line bg-down-tint px-4 py-3.5">
      <p className="text-[14px] font-semibold text-down-deep">{copy.title}</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-down-deep/85">{copy.body}</p>
    </div>
  );
};

const Line = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-muted">{k}</dt>
    <dd className="text-right">
      <span className="block font-medium">{v}</span>
      {sub && <span className="mt-[3px] block text-[12px] leading-[1.4] text-muted">{sub}</span>}
    </dd>
  </div>
);

/* ── the sheet ──────────────────────────────────────────────────────── */

export const BuySheet = ({
  instrument,
  prices,
  open,
  onClose,
  initial,
}: {
  instrument: Instrument;
  prices: PriceMap | undefined;
  open: boolean;
  onClose: () => void;
  /** The amount already typed on the page, so confirming never means typing it twice. */
  initial?: number | undefined;
}) => {
  const available = Number(useMoney().data?.balanceUsd ?? 0);
  const [raw, setRaw] = useState("100");
  const buy = useBuyAction();
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

  const { decision, isLoading } = useDecision(open ? instrument : undefined, settled, prices);

  const typing = settled !== amount;
  const overBalance = amount > available;
  const working = buy.isPending;
  /*
   * `offer_queue` blocks the button. The decision means the market is shut and
   * the price is far enough above fair that we decline to fill it; the answer
   * `decide` offers is a trigger order, which does not exist. Sending it anyway
   * would reach the server and come back refused every single time.
   */
  const blocked =
    working || amount <= 0 || overBalance || !decision || decision.kind !== "execute" || typing || isLoading;

  // The price moved between the quote we showed and the one the server would
  // fill at. Not an error so much as a question, so it reads as one.
  const moved = buy.error instanceof PriceMoved ? buy.error : null;
  const failed = buy.error !== null && moved === null ? buy.error : null;

  const cta = working
    ? STEP_LABEL[buy.step ?? "pricing"]
    : moved
      ? "Buy at the new price"
      : !decision
        ? "Getting a quote\u2026"
        : decision.kind === "offer_queue"
          ? "Not placing this now"
          : decision.kind === "refuse"
            ? "Unavailable"
            : "Buy now";

  const close = () => {
    buy.reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="buy-title"
      className="flex max-h-[min(86vh,780px)] max-w-[520px] flex-col"
    >
      {placed ? (
        <div className="px-6 py-6 sm:px-7">
          <div className="py-4 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-up-tint text-up-deep">
              <Check className="size-6" />
            </span>
            <h2 id="buy-title" className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">
              {placed.simulated ? "Dry run" : "Bought"}
            </h2>
            {/* The numbers read off the chain, not the ones we quoted. What
                someone wants after buying is what they actually got. */}
            <p className="mx-auto mt-2 max-w-[38ch] text-[14px] leading-[1.55] text-muted">
              {placed.simulated
                ? `This server is in dry-run mode, so nothing was sent. ${usd(settled)} of ${instrument.name} would have been bought.`
                : `${Number(placed.shares).toFixed(4)} shares of ${instrument.name} at ${usd(Number(placed.pricePerShare))} a share.`}
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-6 h-11 w-full rounded-[10px] bg-ink text-[15px] font-semibold text-white transition-colors hover:bg-ink-soft"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-5 sm:px-7">
            <h2 id="buy-title" className="text-[22px] font-semibold tracking-[-0.02em]">
              Buy {instrument.name}
            </h2>
            <p className="mt-1 text-[14px] text-muted">{usd(available)} available</p>

            <label className="mt-5 flex items-center gap-1 rounded-xl border border-cardline bg-shell px-4 py-3.5 focus-within:border-brand">
              <span className="text-[26px] font-semibold text-faint">$</span>
              <input
                value={raw}
                onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                aria-label="Amount in dollars"
                className="w-full bg-transparent text-[26px] font-semibold outline-none"
              />
            </label>

            <div className="mt-2.5 flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setRaw(String(p))}
                  className="h-8 flex-1 rounded-lg border border-cardline text-[13px] font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
                >
                  ${p}
                </button>
              ))}
            </div>

            {overBalance && (
              <p className="mt-3 text-[13px] text-down-deep">
                That is more than your {usd(available)} cash. Add money first.
              </p>
            )}

            {moved && (
              <p className="mt-3 flex gap-2 rounded-xl border border-warn-line bg-warn-tint px-3.5 py-3 text-[13px] leading-[1.5] text-warn">
                <Alert className="mt-px size-4 shrink-0" />
                The price moved while you were deciding, so we stopped rather than buy at it. Buying again
                uses the price below.
              </p>
            )}
            {failed && (
              <p className="mt-3 flex gap-2 rounded-xl border border-down-line bg-down-tint px-3.5 py-3 text-[13px] leading-[1.5] text-down-deep">
                <Alert className="mt-px size-4 shrink-0" />
                {failed.message}
              </p>
            )}

            <div className="mt-5">
              {!decision ? (
                <div className="rounded-xl border border-cardline bg-shell px-4 py-3.5">
                  <p className="text-[14px] font-semibold text-muted">
                    {typing ? "Pricing\u2026" : "Quoting every issuer\u2026"}
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.5] text-faint">
                    Routes are quoted for this exact amount, so the answer changes with the number.
                  </p>
                </div>
              ) : (
                <>
                  {decision.kind === "execute" && <Execute d={decision} amount={settled} />}
                  {decision.kind === "offer_queue" && <Queue d={decision} amount={settled} />}
                  {decision.kind === "refuse" && <Refuse d={decision} />}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2.5 border-t border-hair bg-white px-6 py-4 sm:px-7">
            {/* The design system's buttons. These were hand-rolled: a teal
                rectangle at h-11 for the primary action, where every other
                button in the app is a near-black pill at h-10. */}
            <Button size="lg" onClick={close} className="flex-1">
              Cancel
            </Button>
            <Button
              size="lg"
              variant="primary"
              disabled={blocked}
              onClick={() => buy.mutate({ ticker: instrument.ticker, usd: settled })}
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
