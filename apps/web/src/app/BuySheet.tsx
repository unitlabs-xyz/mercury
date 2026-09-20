import { useEffect, useState } from "react";
import type { Decision, OfferQueueDecision, ExecuteDecision, RefuseDecision } from "@harbor/core";
import { Dialog } from "../ui/Dialog";
import { Alert, Check, Clock } from "../ui/icons";
import { CASH } from "./data";
import { IssuerCompare, ISSUER_NAME } from "./IssuerCompare";
import { useDecision } from "../market/hooks";
import type { JupPrice } from "../market/jupiter";
import type { Instrument } from "../market/universe";

const AVAILABLE = Number(CASH.available.replace(/[^0-9.]/g, ""));

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const PRESETS = [50, 100, 250, 500];

const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : null);

/* ── the three outcomes ─────────────────────────────────────────────── */

const Execute = ({ d, amount }: { d: ExecuteDecision; amount: number }) => {
  const price = num(d.best.pricePerShare) ?? 0;
  const premium = (num(d.premium) ?? 0) * 100;
  return (
    <>
      <div className="rounded-xl border border-up-line bg-up-tint px-4 py-3.5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-up-deep">
          <Check className="size-4" />
          Ready to buy
        </p>
        <p className="mt-1 text-[13px] leading-[1.5] text-up-deep/85">
          {ISSUER_NAME[d.best.issuer]} is the cheaper route at this size — {usd(price)} per share,{" "}
          {Math.abs(premium) < 0.01
            ? "in line with the reference price"
            : `${Math.abs(premium).toFixed(2)}% ${premium > 0 ? "above" : "below"} the reference price`}
          .
        </p>
      </div>
      <dl className="mt-4 space-y-2.5 text-[14px]">
        <Line k="You pay" v={usd(amount)} />
        <Line k="Price per share" v={usd(price)} />
        <Line k="Shares" v={(amount / price).toFixed(4)} />
        <Line k="Route" v={d.best.routeLabels.join(" → ")} mono />
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
        <p className="mt-1 text-[13px] leading-[1.5] text-warn/90">
          The market is shut, and the token is {premium.toFixed(2)}% above the reference price —
          more than we think you should pay. We can hold the order and fill it when the price comes
          back.
        </p>
      </div>
      <dl className="mt-4 space-y-2.5 text-[14px]">
        <Line k="You'd pay now" v={`${usd(price)} per share`} />
        <Line k="Fills at or below" v={`${usd(trigger)} per share`} />
        <Line k="Amount held" v={usd(amount)} />
        <Line
          k="Latest"
          v={
            d.marketOpensAt
              ? `${d.marketOpensAt.toLocaleString("en-US", {
                  weekday: "long",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                  timeZoneName: "short",
                })}, when the exchange opens`
              : "When the price returns"
          }
        />
      </dl>
      <p className="mt-4 text-[13px] leading-[1.5] text-muted">
        Your cash stays yours and keeps earning while it waits. Cancel any time.
      </p>
    </>
  );
};

export const REFUSE_COPY: Record<RefuseDecision["reason"], { title: string; body: string }> = {
  below_minimum: { title: "Too small to trade", body: "The smallest order we can route is $5." },
  no_route: {
    title: "No route right now",
    body: "Neither issuer has liquidity for this stock at the moment. Try again shortly.",
  },
  impact_too_high: {
    title: "This order would move the price",
    body: "At this size the pool cannot fill you without a large slip. Try a smaller amount, or queue it for when the market opens.",
  },
  reference_stale: {
    title: "No fresh price",
    body: "We have not had a reference price recently enough to trade safely against it.",
  },
  instrument_halted: { title: "Trading halted", body: "The exchange has halted this stock." },
  corp_action_pending: {
    title: "Dividend pending",
    body: "This stock has gone ex-dividend and the token has not been adjusted yet. Trading reopens once it is.",
  },
  no_candidates: { title: "Not available", body: "We do not have a tokenised version of this stock." },
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

const Line = ({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-muted">{k}</dt>
    <dd className={`text-right font-medium tabular-nums ${mono ? "font-mono text-[13px]" : ""}`}>{v}</dd>
  </div>
);

/* ── the sheet ──────────────────────────────────────────────────────── */

export const BuySheet = ({
  instrument,
  prices,
  open,
  onClose,
}: {
  instrument: Instrument;
  prices: Record<string, JupPrice | null> | undefined;
  open: boolean;
  onClose: () => void;
}) => {
  const [raw, setRaw] = useState("100");
  const [placed, setPlaced] = useState<Decision | null>(null);

  const amount = Number(raw) || 0;

  // Quoting on every keystroke would hammer a free endpoint and flicker the
  // numbers while someone is still typing. Settle first, then quote.
  const [settled, setSettled] = useState(amount);
  useEffect(() => {
    const t = setTimeout(() => setSettled(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);

  const { decision, isLoading, isFetching } = useDecision(
    open ? instrument : undefined,
    settled,
    prices,
  );

  const typing = settled !== amount;
  const overBalance = amount > AVAILABLE;
  const blocked =
    amount <= 0 || overBalance || !decision || decision.kind === "refuse" || typing || isLoading;

  const cta = !decision
    ? "Getting a quote\u2026"
    : decision.kind === "offer_queue"
      ? "Queue this order"
      : decision.kind === "refuse"
        ? "Unavailable"
        : "Buy now";

  const close = () => {
    setPlaced(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} labelledBy="buy-title" className="flex max-h-[min(86vh,780px)] max-w-[520px] flex-col">
      {placed ? (
        <div className="px-6 py-6 sm:px-7">
          <div className="py-4 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-up-tint text-up-deep">
              {placed.kind === "offer_queue" ? <Clock className="size-6" /> : <Check className="size-6" />}
            </span>
            <h2 id="buy-title" className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">
              {placed.kind === "offer_queue" ? "Order queued" : "Bought"}
            </h2>
            <p className="mx-auto mt-2 max-w-[38ch] text-[14px] leading-[1.55] text-muted">
              {placed.kind === "offer_queue"
                ? `${usd(settled)} of ${instrument.name} is waiting on your price. You'll see it in Activity.`
                : `${usd(settled)} of ${instrument.name} is in your portfolio.`}
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
            <p className="mt-1 text-[14px] text-muted">
              {usd(AVAILABLE)} available
            </p>

            <label className="mt-5 flex items-center gap-1 rounded-xl border border-cardline bg-shell px-4 py-3.5 focus-within:border-brand">
              <span className="text-[26px] font-semibold text-faint">$</span>
              <input
                value={raw}
                onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                aria-label="Amount in dollars"
                className="w-full bg-transparent text-[26px] font-semibold tabular-nums outline-none"
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
                That is more than your {usd(AVAILABLE)} cash. Add money first.
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

            <div className="mt-5">
              <IssuerCompare
                decision={decision}
                amount={Math.max(settled, 0.01)}
                loading={isLoading || isFetching}
                wrappers={instrument.wrappers}
              />
            </div>

          </div>

          <div className="flex shrink-0 gap-2.5 border-t border-hair bg-white px-6 py-4 sm:px-7">
            <button
              type="button"
              onClick={close}
              className="h-11 flex-1 rounded-[10px] border border-cardline text-[15px] font-medium transition-colors hover:bg-shell"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => decision && setPlaced(decision)}
              className="h-11 flex-[1.6] rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
            >
              {cta}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
};
