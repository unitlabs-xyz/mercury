import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Decision, PricedCandidate } from "@harbor/core";
import { Bar, Button, Card, Pill, Screen, SectionTitle, Sheet, Stat, StatGroup, cx } from "../ui/primitives";
import { Sparkline } from "../ui/Sparkline";
import { MarketBanner } from "../components/MarketBanner";
import { PORTFOLIO_SERIES, findInstrument } from "../mock/data";
import { quoteFor } from "../mock/engine";
import { bareP, pct, shares, usd } from "../lib/format";

const RANGES = ["1D", "1W", "1M", "1Y", "All"] as const;
const CHIPS = [50, 100, 250, 1000];

export function Stock() {
  const { ticker = "NVDA" } = useParams();
  const nav = useNavigate();
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const [amount, setAmount] = useState(1000);
  const [buying, setBuying] = useState(false);

  const instrument = findInstrument(ticker);
  const result = useMemo(() => quoteFor(ticker, "buy", amount), [ticker, amount]);
  const series = useMemo(() => PORTFOLIO_SERIES.map((v, i) => v + Math.sin(i * 0.9 + ticker.length) * 2.4), [ticker]);

  if (instrument === undefined || result === null) {
    return <Screen><Bar left={<Back onClick={() => nav(-1)} />} title="Not found" /></Screen>;
  }

  const { decision } = result;
  const up = instrument.changePct24h >= 0;

  return (
    <Screen className="pb-32">
      <Bar left={<Back onClick={() => nav(-1)} />} title={instrument.ticker} />

      <div className="px-4 pt-4 enter">
        <p className="m-0 text-[15px] font-medium text-[var(--color-muted)]">{instrument.name}</p>
        <p className="figure m-0 mt-1 text-[40px] leading-none">{usd(Number(instrument.pricePerShare))}</p>
        <p className={cx("num m-0 mt-2 text-[15px]", up ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
          {pct(instrument.changePct24h)} <span className="opacity-60">today</span>
        </p>
      </div>

      <div className="mt-4 enter" style={{ animationDelay: "50ms" }}>
        <Sparkline data={series} tone={up ? "up" : "down"} height={120} />
        <div className="mt-2.5 flex gap-1.5 px-4">
          {RANGES.map((r) => <Pill key={r} active={r === range} onClick={() => setRange(r)}>{r}</Pill>)}
        </div>
      </div>

      <MarketBanner />

      <section className="mt-6 px-4 enter" style={{ animationDelay: "100ms" }}>
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
      </section>

      <IssuerComparison decision={decision} />

      <section className="mt-6">
        <SectionTitle>About</SectionTitle>
        <p className="m-0 px-4 text-[14px] leading-relaxed text-[var(--color-muted)]">{instrument.about}</p>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] bg-black/90 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 backdrop-blur-xl">
        <Button onClick={() => setBuying(true)} disabled={decision.kind === "refuse" || amount <= 0}>
          {decision.kind === "refuse" ? "Unavailable" : `Buy ${instrument.ticker}`}
        </Button>
      </div>

      <BuySheet open={buying} onClose={() => setBuying(false)} decision={decision} ticker={instrument.ticker} />
    </Screen>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Back" className="-ml-1 grid size-9 place-items-center text-white">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}

/** The screen the product is built around. Every issuer, priced per share. */
function IssuerComparison({ decision }: { decision: Decision }) {
  const best = decision.kind === "refuse" ? null : decision.best;

  return (
    <section className="mt-6 enter" style={{ animationDelay: "150ms" }}>
      <SectionTitle right={<span className="text-[13px] text-[var(--color-muted)]">{decision.candidates.length} found</span>}>
        We checked every issuer
      </SectionTitle>

      <div className="flex flex-col gap-2 px-4">
        {decision.candidates.map((c) => {
          const chosen = best !== null && best.mint === c.mint;
          const dearer =
            !chosen && c.viable && best?.pricePerShare != null && c.pricePerShare != null
              ? Number(c.pricePerShare.div(best.pricePerShare).sub(1).toFixed(6))
              : null;
          return <IssuerCard key={c.mint} c={c} chosen={chosen} dearer={dearer} />;
        })}
      </div>

      {best !== null && decision.candidates.length > 1 && (
        <p className="m-0 mt-3 px-4 text-[13px] leading-snug text-[var(--color-faint)]">
          Both tokens track the same company, but each is worth a different number of shares. We compare them per share,
          not per token.
        </p>
      )}
    </section>
  );
}

/** Three states. Chosen, merely dearer, and refused. Calling the middle one avoided would be a lie. */
function IssuerCard({ c, chosen, dearer }: { c: PricedCandidate; chosen: boolean; dearer: number | null }) {
  const issuer = c.issuer === "backed" ? "Backed" : "Ondo";
  const impact = c.priceImpact === null ? null : Number(c.priceImpact.toFixed(6));

  return (
    <Card tone={chosen ? "up" : c.viable ? "surface" : "down"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-semibold">
            {issuer} <span className="font-normal text-[var(--color-muted)]">· {c.symbol}</span>
          </p>
          <p className="num m-0 mt-1 text-[14px] text-[var(--color-muted)]">
            {c.pricePerShare === null ? "No price" : `${usd(Number(c.pricePerShare.toFixed(4)))} / share`}
            {impact !== null && <span className="text-[var(--color-faint)]"> · {bareP(impact)} impact</span>}
          </p>
        </div>
        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
          chosen ? "bg-[var(--color-up)] text-black"
            : c.viable ? "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
            : "bg-[var(--color-down)]/20 text-[var(--color-down)]")}>
          {chosen ? "Best" : c.viable ? "Dearer" : "Refused"}
        </span>
      </div>

      {!c.viable && (
        <p className="m-0 mt-2.5 text-[13px] leading-snug text-[var(--color-down)]">
          {c.rejection === "impact_too_high"
            ? "Too thin to trade at this size. Buying here would cost you many times the real price."
            : "No route exists for this token right now."}
        </p>
      )}
      {dearer !== null && (
        <p className="m-0 mt-2.5 text-[13px] leading-snug text-[var(--color-faint)]">
          Tradable, but {bareP(dearer)} dearer per share once each token&rsquo;s multiplier is taken into account.
        </p>
      )}
      {chosen && (
        <p className="m-0 mt-2.5 text-[13px] text-[var(--color-up)]/70">
          Deep enough for this order · routed through {c.routeLabels.join(", ")}
        </p>
      )}
    </Card>
  );
}

/** Three outcomes, all designed. Filled, queued, refused. */
function BuySheet({ open, onClose, decision, ticker }: {
  open: boolean; onClose: () => void; decision: Decision; ticker: string;
}) {
  const [done, setDone] = useState<null | "filled" | "queued">(null);
  const close = () => { setDone(null); onClose(); };

  if (decision.kind === "refuse") {
    return (
      <Sheet open={open} onClose={close} title="We will not place this order">
        <div className="px-4 pt-2">
          <p className="m-0 text-[15px] leading-relaxed text-[var(--color-muted)]">{decision.detail}</p>
          <div className="mt-5"><Button variant="ghost" onClick={close}>Back</Button></div>
        </div>
      </Sheet>
    );
  }

  const best = decision.best;
  const premium = Number(decision.premium.toFixed(6));
  const amount = Number(decision.amount.toFixed(2));
  const perShare = best.pricePerShare === null ? 0 : Number(best.pricePerShare.toFixed(6));
  const got = perShare === 0 ? 0 : amount / perShare;
  const queue = decision.kind === "offer_queue";

  if (done !== null) {
    return (
      <Sheet open={open} onClose={close} title={done === "filled" ? "Done" : "Order queued"}>
        <div className="px-4 pt-2">
          <p className="figure m-0 text-[34px] leading-none">
            {done === "filled" ? `${shares(got)} shares` : usd(amount)}
          </p>
          <p className="m-0 mt-2.5 text-[15px] leading-relaxed text-[var(--color-muted)]">
            {done === "filled"
              ? `Bought through ${best.issuer === "backed" ? "Backed" : "Ondo"} at ${usd(perShare)} a share. Your ${ticker} is in your wallet.`
              : "Your order rests on chain and fills when the price comes back in line, even if this app is closed."}
          </p>
          <div className="mt-5"><Button onClick={close}>Close</Button></div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} title={queue ? "This is above the real price" : `Buy ${ticker}`}>
      <div className="px-4 pt-2">
        {queue && (
          <Card tone="warn" className="mb-3">
            <p className="m-0 text-[14px] leading-relaxed text-[var(--color-warn)]">
              {ticker} is trading {bareP(premium)} above the real share price because the US market is shut. We can place
              your order at {usd(Number(decision.suggestedTriggerPricePerShare.toFixed(2)))} instead, and it fills when
              the market comes back in line.
            </p>
          </Card>
        )}

        <StatGroup>
          <Stat k="You pay" v={usd(amount)} />
          <Stat k="You receive" v={`${shares(got)} shares`} />
          <Stat k="Price per share" v={usd(perShare)} />
          <Stat k="Issuer" v={`${best.issuer === "backed" ? "Backed" : "Ondo"} · ${best.symbol}`} />
          <Stat k="Against the real price" v={pct(premium)} tone={premium > 0.005 ? "down" : "up"} />
        </StatGroup>

        {decision.kind === "execute" && decision.warning !== null && (
          <p className="m-0 mt-3 text-[13px] text-[var(--color-warn)]">{decision.warning}</p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={() => setDone(queue ? "queued" : "filled")}>
            {queue ? "Wait for the real price" : `Buy ${ticker}`}
          </Button>
          {queue && (
            <Button variant="quiet" onClick={() => setDone("filled")}>
              Buy now anyway at {bareP(premium)} above
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
