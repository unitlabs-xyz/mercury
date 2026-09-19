import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Decision } from "@harbor/sdk";
import { client, pct, usd } from "../lib/client";
import { MarketBanner } from "../components/MarketBanner";

/**
 * The signature screen. Both issuers priced per share, one chosen and one refused,
 * with the reason. Regenerated for the amount being spent, because the answer changes
 * with size. See docs/02 and docs/04.
 */
export function StockPage() {
  const { ticker = "NVDA" } = useParams();
  const [amount, setAmount] = useState("1000");

  const instrument = useQuery({ queryKey: ["instrument", ticker], queryFn: () => client.instrument(ticker) });
  const order = useQuery({
    queryKey: ["quote", ticker, amount],
    queryFn: () => client.createOrder({ ticker, side: "buy", amount }),
    enabled: Number(amount) > 0,
  });

  const decision = order.data?.decision;

  return (
    <div className="pb-24">
      <MarketBanner />
      <header className="px-4">
        <h1 className="m-0 text-3xl font-bold">{instrument.data?.name ?? ticker}</h1>
        <p className="m-0 mt-1 text-[var(--color-text-muted)]">{ticker}</p>
        <p className="tabular m-0 mt-4 text-4xl font-bold">{usd(instrument.data?.pricePerShare ?? null)}</p>
      </header>

      <section className="mt-6 px-4">
        <label className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">AMOUNT</label>
        <input
          className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 py-3 text-2xl tabular"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </section>

      <section className="mt-6 px-4">
        <h2 className="m-0 text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">WE CHECKED BOTH ISSUERS</h2>
        <div className="mt-3 flex flex-col gap-3">
          {decision?.candidates.map((c) => {
            const chosen = decision.kind !== "refuse" && decision.best.mint === c.mint;
            return (
              <article
                key={c.mint}
                className={`rounded-[var(--radius-card)] px-4 py-3 ${
                  chosen ? "bg-[#dcf7ec] ring-2 ring-[var(--color-positive)]" : "bg-[var(--color-surface)]"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <strong>
                    {c.issuer === "backed" ? "Backed" : "Ondo"} · {c.symbol}
                  </strong>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      chosen ? "bg-[var(--color-positive)] text-white" : "bg-[#fee2e2] text-[var(--color-negative)]"
                    }`}
                  >
                    {chosen ? "BEST" : "AVOIDED"}
                  </span>
                </div>
                <p className="tabular m-0 mt-1 text-sm text-[var(--color-text-muted)]">
                  {usd(c.pricePerShare)} per share · {pct(c.priceImpact)} impact
                </p>
                {!c.viable && (
                  <p className="m-0 mt-1 text-sm text-[var(--color-negative)]">
                    {c.rejection === "impact_too_high" ? "Too thin. We will not route here." : "No route at this size."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {decision !== undefined && <Outcome decision={decision} />}
    </div>
  );
}

function Outcome({ decision }: { decision: Decision }) {
  if (decision.kind === "refuse") {
    return (
      <section className="mt-6 px-4">
        <div className="rounded-[var(--radius-card)] bg-[#fee2e2] px-4 py-3">
          <strong className="text-[var(--color-negative)]">We will not place this order</strong>
          <p className="m-0 mt-1 text-sm text-[var(--color-negative)]">{decision.detail}</p>
        </div>
      </section>
    );
  }

  if (decision.kind === "offer_queue") {
    return (
      <section className="mt-6 px-4">
        <div className="rounded-[var(--radius-card)] bg-[#e0eafe] px-4 py-3 ring-2 ring-[var(--color-accent)]">
          <strong className="text-[var(--color-accent)]">Wait for the real price</strong>
          <p className="m-0 mt-1 text-sm text-[#1e40af]">
            This is {pct(decision.premium)} above the real share price. We can place your order at{" "}
            {usd(decision.suggestedTriggerPricePerShare)} and it fills when the market comes back in line, even if this
            app is closed.
          </p>
        </div>
        <button className="mt-3 w-full rounded-[var(--radius-button)] bg-[var(--color-accent)] px-4 py-4 text-lg font-bold text-white">
          Queue my order
        </button>
        <button className="mt-2 w-full rounded-[var(--radius-button)] border border-[var(--color-border)] px-4 py-4 font-semibold text-[var(--color-text-muted)]">
          Buy now anyway at {pct(decision.premium)}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 px-4">
      {decision.warning !== null && <p className="text-sm text-[var(--color-warning)]">{decision.warning}</p>}
      <button className="w-full rounded-[var(--radius-button)] bg-[var(--color-accent)] px-4 py-4 text-lg font-bold text-white">
        Buy {decision.ticker}
      </button>
    </section>
  );
}
