import { useEffect, useState } from "react";
import type { OfferQueueDecision, ExecuteDecision, RefuseDecision } from "@mercury/core";
import { Dialog } from "../ui/Dialog";
import { Alert, Check, Clock } from "../ui/icons";
import { useMoney } from "../api/hooks";
import { PriceMoved, useOrderAction } from "../api/orders";
import { ISSUER_NAME } from "./IssuerCompare";
import { Button } from "../ui/Button";
import { useDecision } from "../market/hooks";
import type { Instrument, PriceMap } from "../market/hooks";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const PRESETS = [50, 100, 250, 500];

/* Fractions of the position when selling, for the reason the ticket has them:
   a $50 chip does nothing on a $30 holding. See stock/Ticket.tsx. */
const SELL_PRESETS = [0.25, 0.5, 0.75, 1] as const;

/* The ticket's preset chip (stock/Ticket.tsx): the chosen one raised, the rest flat on the panel. */
const chip = (on: boolean) =>
  `h-8 rounded-md border text-[14px] leading-none text-ds-ink transition-colors max-sm:h-10 disabled:opacity-40 ${
    on ? "border-black/10 bg-linear-to-b from-white to-[#eeeeee]" : "border-transparent hover:bg-white/70"
  }`;

const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : null);

/* ── the three outcomes ─────────────────────────────────────────────── */

const Execute = ({
  d,
  amount,
  fee,
  proceeds,
}: {
  d: ExecuteDecision;
  amount: number;
  fee: number;
  /** What a sale lands, net of the charge. Null on a buy. */
  proceeds: number | null;
}) => {
  const selling = d.side === "sell";
  const sold = num(d.best.filledShares);
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
  /*
   * What the swap is actually for. The network charge comes out of the amount
   * rather than being added to it, so a buyer holding exactly $5 can still
   * spend all of it — adding on top would put their own balance out of reach.
   */
  const invested = amount - fee;
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
      <dl className="flex flex-col gap-3 px-1">
        {/* `You pay` is the amount that leaves the wallet, which is why the
            charge is shown under it rather than beside the total. Both lines
            appear only when something is owed, which is once per stock. */}
        {selling ? (
          <>
            <Line k="You sell" v={`${(sold ?? 0).toFixed(4)} shares`} />
            {fee > 0 && (
              <Line k="Network fee" v={`−${usd(fee)}`} sub="Covers sending the dollars to your wallet" />
            )}
            <Line k="You get" v={usd(proceeds ?? 0)} />
          </>
        ) : (
          <>
            <Line k="You pay" v={usd(amount)} />
            {fee > 0 && (
              <>
                <Line k="Network fee" v={`−${usd(fee)}`} sub="Covers opening your account for this stock" />
                <Line k="Invested" v={usd(invested)} />
              </>
            )}
          </>
        )}
        <Line
          k="Price per share"
          v={usd(price)}
          sub={
            Math.abs(premium) < 0.01
              ? "In line with the real share price"
              : `${Math.abs(premium).toFixed(2)}% ${premium > 0 ? "above" : "below"} the real share price`
          }
        />
        {/* Shares follow what is invested, not what is paid. Dividing by the
            gross would print a figure the order cannot deliver. A sale's share
            count is not derived at all — it is the quantity being sold, and it
            is already on the first line. */}
        <Line
          k={selling ? "Worth" : "Shares"}
          v={selling ? usd((sold ?? 0) * price) : (invested / price).toFixed(4)}
          {...(!selling && worst && worst > price
            ? { sub: `At least ${(invested / worst).toFixed(4)} if the price moves before it lands` }
            : selling && worst && worst < price
              ? { sub: `At least ${usd((sold ?? 0) * worst)} if the price moves before it lands` }
              : {})}
        />
        {/* Not monospace: "Raydium CLMM" is the name of a venue, not a
            measurement. Mono here was a costume for "technical". */}
        <Line k="Route" v={`${ISSUER_NAME[d.best.issuer]} · ${d.best.routeLabels.join(" → ")}`} />
      </dl>
      {d.warning && (
        <p className="mt-4 flex gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn">
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

export const OrderSheet = ({
  instrument,
  prices,
  open,
  onClose,
  initial,
  side = "buy",
  max = false,
  sellableUsd = null,
}: {
  instrument: Instrument;
  prices: PriceMap | undefined;
  open: boolean;
  onClose: () => void;
  /** The amount already typed on the page, so confirming never means typing it twice. */
  initial?: number | undefined;
  side?: "buy" | "sell";
  /** Sell the whole position, in tokens. The amount is then only a display figure. */
  max?: boolean;
  /** What the sellable part of the position is worth. The fractions are of this. */
  sellableUsd?: number | null;
}) => {
  const selling = side === "sell";
  const available = Number(useMoney().data?.balanceUsd ?? 0);
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

  const { decision, isLoading, fee, proceeds } = useDecision(open ? instrument : undefined, settled, prices, {
    side,
    max,
  });
  const proceedsUsd = proceeds === null ? null : Number(proceeds.toString());
  /* Zero unless a relayer is paying the network on this buyer's behalf. */
  const feeUsd = fee === null ? 0 : Number(fee.toString());

  const typing = settled !== amount;
  /* A sale is not spending, so the cash balance has nothing to say about it. */
  const overBalance = !selling && amount > available;
  const working = buy.isPending;
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

  const close = () => {
    buy.reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      labelledBy="order-title"
      className="flex max-h-[min(86vh,780px)] max-w-[520px] flex-col"
    >
      {placed ? (
        <div className="px-6 py-6">
          <div className="py-4 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
              <Check className="size-5" />
            </span>
            <h2 id="order-title" className="mt-4 text-[20px] leading-none font-medium text-ds-ink">
              {selling ? "Sold" : "Bought"}
            </h2>
            {/* The numbers read off the chain, not the ones we quoted. What
                someone wants after a trade is what they actually got. */}
            <p className="mx-auto mt-3 max-w-[38ch] text-[14px] leading-[1.45] text-ds-muted">
              {Number(placed.shares).toFixed(4)} shares of {instrument.name} at{" "}
              {usd(Number(placed.pricePerShare))} a share.
            </p>
            {/* A sale is the one moment in this product where a gain stops
                being a number on a screen and becomes money. Worth saying. */}
            {placed.realisedPnlUsd !== null && (
              <p className="mt-1.5 text-[14px] text-ds-muted">
                {Number(placed.realisedPnlUsd) < 0 ? "Realised loss" : "Realised gain"}{" "}
                <span
                  className={`font-medium ${Number(placed.realisedPnlUsd) < 0 ? "text-ds-down" : "text-ds-up"}`}
                >
                  {usd(Math.abs(Number(placed.realisedPnlUsd)))}
                </span>
              </p>
            )}
            <Button variant="primary" size="lg" onClick={close} className="mt-6 w-full">
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-6">
            <h2 id="order-title" className="text-[20px] leading-none font-medium text-ds-ink">
              {selling ? "Sell" : "Buy"} {instrument.name}
            </h2>
            {!selling && (
              <p className="mt-3 text-[14px] leading-none text-ds-muted">{usd(available)} available</p>
            )}

            {/* The amount, as the stock page's ticket: a white well on the grey panel, the presets under it. */}
            <div className="mt-5 rounded-lg bg-ds-panel p-1">
              <label className="flex h-15 items-center gap-1 rounded-md bg-white px-4 focus-within:outline-1 focus-within:outline-black/10">
                <span className="text-[28px] leading-none font-medium text-ds-muted">$</span>
                <input
                  value={raw}
                  onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  aria-label="Amount in dollars"
                  className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none"
                />
                <span className="shrink-0 text-[12px] text-ds-muted">USD</span>
              </label>
              <div className="mt-1 grid grid-cols-4 gap-1" role="group" aria-label="Amount presets">
                {selling
                  ? SELL_PRESETS.map((f) => {
                      const value = sellableUsd === null ? "" : (sellableUsd * f).toFixed(2);
                      return (
                        <button
                          key={f}
                          type="button"
                          disabled={sellableUsd === null}
                          onClick={() => setRaw(value)}
                          aria-pressed={value !== "" && raw === value}
                          className={chip(value !== "" && raw === value)}
                        >
                          {f === 1 ? "All" : `${f * 100}%`}
                        </button>
                      );
                    })
                  : PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setRaw(String(p))}
                        aria-pressed={amount === p}
                        className={chip(amount === p)}
                      >
                        ${p}
                      </button>
                    ))}
              </div>
            </div>

            {overBalance && (
              <p className="mt-3 px-1 text-[12px] leading-[1.45] text-ds-chip-down">
                That is more than your {usd(available)} cash. Add money first.
              </p>
            )}

            {moved && (
              <p className="mt-3 flex gap-2 rounded-lg bg-ds-warn-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-warn">
                <Alert className="mt-px size-3.5 shrink-0" />
                The price moved while you were deciding, so we stopped rather than buy at it. Buying again
                uses the price below.
              </p>
            )}
            {failed && (
              <p className="mt-3 flex gap-2 rounded-lg bg-ds-down-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-down">
                <Alert className="mt-px size-3.5 shrink-0" />
                {failed.message}
              </p>
            )}

            <div className="mt-5">
              {!decision ? (
                <div className="rounded-lg bg-ds-panel px-4 py-4">
                  <p className="text-[14px] leading-none font-medium text-ds-ink">
                    {typing ? "Pricing\u2026" : "Quoting every issuer\u2026"}
                  </p>
                  <p className="mt-2 text-[12px] leading-[1.45] text-ds-muted">
                    Routes are quoted for this exact amount, so the answer changes with the number.
                  </p>
                </div>
              ) : (
                <>
                  {decision.kind === "execute" && (
                    <Execute d={decision} amount={settled} fee={feeUsd} proceeds={proceedsUsd} />
                  )}
                  {decision.kind === "offer_queue" && <Queue d={decision} amount={settled} />}
                  {decision.kind === "refuse" && <Refuse d={decision} />}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2.5 border-t border-ds-divider bg-white px-6 py-4">
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
              loading={working}
              onClick={() =>
                buy.mutate({
                  ticker: instrument.ticker,
                  side,
                  usd: settled,
                  ...(max ? { max: true } : {}),
                })
              }
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
