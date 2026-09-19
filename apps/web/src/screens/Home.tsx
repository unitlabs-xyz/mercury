import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetRow, Card, Glyph, Pill, Screen, SectionTitle } from "../ui/primitives";
import { Sparkline } from "../ui/Sparkline";
import { MarketBanner } from "../components/MarketBanner";
import { CASH_USD, HOLDINGS, PORTFOLIO_SERIES } from "../mock/data";
import { pct, shares, signed, usd } from "../lib/format";

const RANGES = ["1W", "1M", "3M", "1Y", "All"] as const;

export function Home() {
  const nav = useNavigate();
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");

  const invested = useMemo(() => HOLDINGS.reduce((a, h) => a + h.valueUsd, 0), []);
  const cost = useMemo(() => HOLDINGS.reduce((a, h) => a + h.costBasisUsd, 0), []);
  const total = invested + CASH_USD;
  const change = invested - cost;
  const up = change >= 0;

  return (
    <Screen>
      <div className="px-4 pt-7 enter">
        <p className="micro m-0">Total balance</p>
        <p className="figure m-0 mt-1 text-[44px] leading-none">{usd(total)}</p>
        <p className={`num m-0 mt-2 text-[15px] ${up ? "text-[var(--color-up)]" : "text-[var(--color-down)]"}`}>
          {signed(change)} <span className="opacity-60">{pct(cost === 0 ? 0 : change / cost)} all time</span>
        </p>
      </div>

      <div className="mt-4 enter" style={{ animationDelay: "50ms" }}>
        <Sparkline data={PORTFOLIO_SERIES} tone={up ? "up" : "down"} height={110} />
        <div className="mt-2.5 flex gap-1.5 px-4">
          {RANGES.map((r) => <Pill key={r} active={r === range} onClick={() => setRange(r)}>{r}</Pill>)}
        </div>
      </div>

      <MarketBanner />

      <section className="mt-6 enter" style={{ animationDelay: "100ms" }}>
        <SectionTitle right={<span className="num text-[13px] text-[var(--color-muted)]">{usd(invested)}</span>}>
          Holdings
        </SectionTitle>
        <div className="flex flex-col gap-2 px-4">
          {HOLDINGS.map((h) => (
            <AssetRow
              key={h.ticker}
              icon={<Glyph text={h.ticker} tint={h.kind === "basket" ? "#00d26b" : undefined} />}
              title={h.name}
              badge={h.wrapperCount > 1 ? (
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted)]">
                  {h.wrapperCount} issuers
                </span>
              ) : undefined}
              sub={h.kind === "basket" ? `Basket · ${shares(h.shares)} units` : `${shares(h.shares)} shares`}
              value={usd(h.valueUsd)}
              foot={pct(h.changePct24h)}
              tone={h.changePct24h >= 0 ? "up" : "down"}
              onClick={() => nav(h.kind === "basket" ? `/basket/${h.slug}` : `/stock/${h.ticker}`)}
            />
          ))}
          <AssetRow icon={<Glyph text="$" tint="#8e9196" />} title="Cash" sub="Earning 4.80% while it waits"
            value={usd(CASH_USD)} onClick={() => nav("/money")} />
        </div>
      </section>

      <section className="mt-5 px-4 enter" style={{ animationDelay: "150ms" }}>
        <Card tone="outline" onClick={() => nav("/exposure/NVDA")} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[15px] font-semibold">Your true NVIDIA exposure</p>
            <p className="m-0 mt-0.5 text-[13px] leading-snug text-[var(--color-muted)]">
              $533.28 held as two different tokens. They are not interchangeable.
            </p>
          </div>
          <span className="shrink-0 text-[var(--color-faint)]">›</span>
        </Card>
      </section>
    </Screen>
  );
}
