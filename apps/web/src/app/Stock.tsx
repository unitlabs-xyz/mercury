import { useMemo, useState } from "react";
import type { Decision } from "@harbor/core";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "./AppShell";
import { BuySheet, REFUSE_COPY } from "./BuySheet";
import { IssuerCompare } from "./IssuerCompare";
import { findInstrument, MARKET_OPENS_ET, priceFor } from "./market";
import { Alert, ArrowDown, ArrowUp, Clock } from "../ui/icons";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * "Which issuer is cheaper" and "should you buy at all" are different questions.
 * The comparison answers the first; without this, the second stays hidden until
 * the sheet opens, which makes a green BEST chip look like a recommendation.
 */
const Verdict = ({ decision }: { decision: Decision }) => {
  if (decision.kind === "execute") return null;

  if (decision.kind === "offer_queue") {
    const premium = Number(decision.premium.toString()) * 100;
    return (
      <div className="flex gap-2.5 rounded-2xl border border-warn-line bg-warn-tint px-4 py-3.5">
        <Clock className="mt-px size-4 shrink-0 text-warn" />
        <p className="text-[13px] leading-[1.55] text-warn">
          <span className="font-semibold">Trading {premium.toFixed(2)}% above the reference.</span>{" "}
          More than we think you should pay while the exchange is shut. You can still buy, or let us
          hold the order and fill it when the price comes back.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 rounded-2xl border border-down-line bg-down-tint px-4 py-3.5">
      <Alert className="mt-px size-4 shrink-0 text-down-deep" />
      <p className="text-[13px] leading-[1.55] text-down-deep">
        <span className="font-semibold">{REFUSE_COPY[decision.reason].title}.</span>{" "}
        {REFUSE_COPY[decision.reason].body}
      </p>
    </div>
  );
};

const Missing = () => (
  <AppShell current="invest" title="Invest">
    <div className="rounded-2xl border border-cardline bg-white px-6 py-12 text-center">
      <p className="text-[15px] font-semibold">We don't have that one</p>
      <p className="mt-1.5 text-[14px] text-muted">No tokenised version of that ticker exists yet.</p>
      <Link
        to="/invest"
        className="mt-5 inline-flex h-10 items-center rounded-[10px] bg-ink px-4 text-[14px] font-semibold text-white transition-colors hover:bg-ink-soft"
      >
        Back to Invest
      </Link>
    </div>
  </AppShell>
);

export const Stock = () => {
  const { ticker = "" } = useParams();
  const instrument = findInstrument(ticker);
  const [buying, setBuying] = useState(false);

  // The comparison on this page is for a representative $1,000 order — the size
  // the measurement was taken at. The sheet re-prices for the real amount.
  const decision = useMemo(() => (instrument ? priceFor(instrument, 1000) : null), [instrument]);

  if (!instrument || !decision) return <Missing />;

  const up = instrument.todayPct >= 0;

  return (
    <AppShell
      current="invest"
      title={instrument.name}
      aside={
        <span className="rounded-md bg-chip px-2 py-1 font-mono text-[12px] text-ink-soft">
          {instrument.ticker}
        </span>
      }
      actions={
        <Link
          to="/invest"
          className="flex h-9 items-center rounded-[9px] border border-cardline px-3.5 text-[14px] font-medium transition-colors hover:bg-white"
        >
          All stocks
        </Link>
      }
    >
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-5">
          <section className="rounded-2xl border border-cardline bg-white px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3.5">
              {instrument.logo ? (
                <img src={instrument.logo} alt="" width={40} height={40} className="size-10 rounded-full" />
              ) : (
                <span className="grid size-10 place-items-center rounded-full bg-chip text-[13px] font-bold text-ink-soft">
                  {instrument.ticker.slice(0, 2)}
                </span>
              )}
              <p className="text-[14px] text-muted">{instrument.sector}</p>
            </div>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[32px] font-semibold tracking-[-0.02em] tabular-nums">
                {usd(instrument.fair)}
              </span>
              <span
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold tabular-nums ${
                  up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"
                }`}
              >
                {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                {Math.abs(instrument.todayPct).toFixed(2)}% today
              </span>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              Reference price of one real share, from Chainlink.
            </p>

            <p className="mt-4 flex items-start gap-2 rounded-xl border border-hair bg-shell px-3.5 py-3 text-[13px] leading-[1.5] text-muted">
              <Clock className="mt-px size-4 shrink-0 text-faint" />
              The exchange is shut. You can still buy — the token trades all week — but we check the
              price against the reference before we do. Opens {MARKET_OPENS_ET}.
            </p>
          </section>

          <Verdict decision={decision} />

          <IssuerCompare decision={decision} amount={1000} />

          <section className="rounded-2xl border border-cardline bg-white px-5 py-5 sm:px-6">
            <h2 className="text-[15px] font-semibold">About</h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">{instrument.about}</p>
            {!instrument.measured && (
              <p className="mt-3 text-[13px] leading-[1.5] text-faint">
                Quotes for this stock are illustrative. The six on the Popular shelf carry routes
                measured on Jupiter.
              </p>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-cardline bg-white px-5 py-5">
            <p className="text-[13px] text-muted">Buy {instrument.name}</p>
            <p className="mt-1 text-[14px] leading-[1.5] text-ink-soft">
              We check both issuers for the amount you enter and take the cheaper one per real
              share.
            </p>
            <button
              type="button"
              onClick={() => setBuying(true)}
              className="mt-4 h-11 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep"
            >
              Buy
            </button>
            <button
              type="button"
              disabled
              className="mt-2 h-11 w-full cursor-not-allowed rounded-[10px] border border-cardline text-[15px] font-medium text-faint"
            >
              Set up recurring
            </button>
          </div>
        </aside>
      </div>

      <BuySheet instrument={instrument} open={buying} onClose={() => setBuying(false)} />
    </AppShell>
  );
};
