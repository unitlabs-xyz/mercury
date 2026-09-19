import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { allocate, D } from "@harbor/core";
import { Bar, Button, Card, Pill, Screen, SectionTitle, Sheet, Stat, StatGroup } from "../ui/primitives";
import { MarketBanner } from "../components/MarketBanner";
import { BASKETS, findInstrument } from "../mock/data";
import { quoteFor } from "../mock/engine";
import { pct, usd } from "../lib/format";

const CHIPS = [50, 100, 250, 500];

export function BasketScreen() {
  const { slug = "core-us" } = useParams();
  const nav = useNavigate();
  const [amount, setAmount] = useState(250);
  const [open, setOpen] = useState(false);

  const basket = BASKETS.find((b) => b.slug === slug);

  const legs = useMemo(() => {
    if (basket === undefined || amount <= 0) return [];
    return allocate(D(amount), basket.constituents.map((c) => ({ ticker: c.ticker, weightBps: c.weightBps })))
      .map((leg) => {
        const usdAmount = Number(leg.usdAmount.toFixed(2));
        return { ...leg, usdAmount, result: quoteFor(leg.ticker, "buy", usdAmount) };
      });
  }, [basket, amount]);

  if (basket === undefined) return <Screen><Bar title="Not found" /></Screen>;

  const refused = legs.filter((l) => l.result === null || l.result.decision.kind === "refuse");
  const queued = legs.filter((l) => l.result?.decision.kind === "offer_queue");
  const blocked = refused.length > 0;

  return (
    <Screen className="pb-32">
      <Bar left={<button onClick={() => nav(-1)} aria-label="Back" className="-ml-1 grid size-9 place-items-center text-[22px]">‹</button>}
        title={basket.name} />

      <div className="px-4 pt-3 enter">
        <p className="m-0 text-[15px] leading-relaxed text-[var(--color-muted)]">{basket.tagline}</p>
        <p className="figure m-0 mt-4 text-[38px] leading-none text-[var(--color-up)]">{pct(basket.performance12m)}</p>
        <p className="micro m-0 mt-1.5">Past twelve months</p>
      </div>

      <MarketBanner />

      <section className="mt-6 enter" style={{ animationDelay: "60ms" }}>
        <SectionTitle>What is inside</SectionTitle>
        <div className="flex flex-col gap-3.5 px-4">
          {basket.constituents.map((c) => {
            const drift = c.currentWeightBps - c.weightBps;
            return (
              <div key={c.ticker}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-medium">{c.name}</span>
                  <span className="num text-[14px] text-[var(--color-muted)]">
                    {(c.weightBps / 100).toFixed(0)}%
                    {Math.abs(drift) >= 20 && <span className="text-[var(--color-faint)]"> · now {(c.currentWeightBps / 100).toFixed(1)}%</span>}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
                  <div className="h-full rounded-full bg-[var(--color-up)]" style={{ width: `${c.weightBps / 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-3.5 px-4 text-[13px] leading-snug text-[var(--color-faint)]">
          Weights drift as prices move. This basket does not rebalance yet, so we show you where it actually sits.
        </p>
      </section>

      <section className="mt-6 px-4">
        <StatGroup>
          <Stat k="Management fee" v={basket.feeBps === 0 ? "None" : `${(basket.feeBps / 100).toFixed(2)}% a year`} />
          <Stat k="Minimum" v={usd(basket.minimumUsd, 0)} />
          {basket.capUsd !== null && <Stat k="Capped at" v={usd(basket.capUsd, 0)} tone="warn" />}
          <Stat k="Held by" v="Symmetry" />
        </StatGroup>
        {basket.capUsd !== null && (
          <p className="m-0 mt-3 text-[13px] leading-snug text-[var(--color-faint)]">
            Capped while the vault contract is new. You can withdraw directly through Symmetry even if this app
            disappears.
          </p>
        )}
      </section>

      <section className="mt-6 px-4">
        <p className="micro m-0">Amount</p>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="figure text-[30px] text-[var(--color-faint)]">$</span>
          <input inputMode="decimal" value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0))}
            className="figure w-full bg-transparent text-[38px] leading-none outline-none" />
        </div>
        <div className="mt-3 flex gap-2">
          {CHIPS.map((c) => <Pill key={c} active={c === amount} onClick={() => setAmount(c)}>${c}</Pill>)}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {legs.map((l) => {
            const kind = l.result?.decision.kind ?? "refuse";
            return (
              <div key={l.ticker} className="flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--color-surface)] px-4 py-3">
                <span className="text-[15px] font-medium">{findInstrument(l.ticker)?.name ?? l.ticker}</span>
                <span className="flex items-center gap-2.5">
                  <span className="num text-[14px] text-[var(--color-muted)]">{usd(l.usdAmount)}</span>
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${
                    kind === "execute" ? "text-[var(--color-up)]" : kind === "offer_queue" ? "text-[var(--color-warn)]" : "text-[var(--color-down)]"}`}>
                    {kind === "execute" ? "Ready" : kind === "offer_queue" ? "Will wait" : "Blocked"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {blocked && (
          <Card tone="down" className="mt-3">
            <p className="m-0 text-[13px] leading-snug text-[var(--color-down)]">
              One holding cannot be bought at this size, so we will not buy the rest either. A basket with a missing
              piece is not the basket you chose.
            </p>
          </Card>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] bg-black/90 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 backdrop-blur-xl">
        <Button onClick={() => setOpen(true)} disabled={blocked || amount < basket.minimumUsd}>
          {amount < basket.minimumUsd ? `Minimum is ${usd(basket.minimumUsd, 0)}` : `Invest ${usd(amount, 0)}`}
        </Button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Invest in ${basket.name}`}>
        <div className="px-4 pt-2">
          <p className="m-0 text-[15px] leading-relaxed text-[var(--color-muted)]">
            Buys all {basket.constituents.length} holdings at once. Afterwards you hold a single position you can send,
            sell, or later borrow against.
          </p>
          <div className="mt-4">
            <StatGroup>
              <Stat k="You invest" v={usd(amount)} />
              <Stat k="Holdings bought" v={`${basket.constituents.length}`} />
              <Stat k="Legs waiting for the open" v={`${queued.length}`} tone={queued.length > 0 ? "warn" : undefined} />
            </StatGroup>
          </div>
          <div className="mt-5"><Button onClick={() => setOpen(false)}>Confirm</Button></div>
        </div>
      </Sheet>
    </Screen>
  );
}
