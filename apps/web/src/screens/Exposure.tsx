import { useNavigate, useParams } from "react-router-dom";
import { Bar, Card, Screen, SectionTitle } from "../ui/primitives";
import { NVDA_EXPOSURE, findInstrument } from "../mock/data";
import { shares, usd } from "../lib/format";

/**
 * The screen no traditional broker needs. A user can hold several tokens for the same
 * company and each is worth a different number of shares. We add them up properly.
 */
export function Exposure() {
  const { ticker = "NVDA" } = useParams();
  const nav = useNavigate();
  const instrument = findInstrument(ticker);
  const rows = NVDA_EXPOSURE;

  const totalShares = rows.reduce((a, r) => a + r.shares, 0);
  const totalValue = rows.reduce((a, r) => a + r.valueUsd, 0);
  const top = rows.reduce((a, r) => Math.max(a, r.sharePct), 0);

  return (
    <Screen>
      <Bar left={<button onClick={() => nav(-1)} aria-label="Back" className="-ml-1 grid size-9 place-items-center text-[22px]">‹</button>}
        title={`${ticker} exposure`} />

      <div className="px-4 pt-3 enter">
        <p className="micro m-0">Total holding</p>
        <p className="figure m-0 mt-1 text-[44px] leading-none">{usd(totalValue)}</p>
        <p className="num m-0 mt-2 text-[15px] text-[var(--color-muted)]">
          {shares(totalShares)} shares of {instrument?.name ?? ticker}
        </p>
      </div>

      <section className="mt-6 enter" style={{ animationDelay: "50ms" }}>
        <SectionTitle>Held as</SectionTitle>
        <div className="flex flex-col gap-2 px-4">
          {rows.map((r) => (
            <Card key={r.symbol}>
              <div className="flex items-baseline justify-between">
                <span className="text-[16px] font-semibold">{r.symbol}</span>
                <span className="num text-[16px] font-semibold">{usd(r.valueUsd)}</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="text-[13px] text-[var(--color-muted)]">
                  {r.issuer === "backed" ? "Backed" : "Ondo"} · multiplier {r.multiplier}
                </span>
                <span className="num text-[13px] text-[var(--color-muted)]">{r.sharePct}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div className="h-full rounded-full bg-[var(--color-up)]" style={{ width: `${r.sharePct}%` }} />
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-5 px-4 enter" style={{ animationDelay: "100ms" }}>
        <Card tone="warn">
          <p className="m-0 text-[14px] font-semibold text-[var(--color-warn)]">Why this screen exists</p>
          <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-[var(--color-warn)]/65">
            Both tokens track {instrument?.name ?? ticker}, but one token is not one share, and the two issuers do not
            use the same ratio. Adding token counts together would give you the wrong number. We convert each to shares
            first. Most apps do not.
          </p>
        </Card>
        {top >= 80 && (
          <p className="m-0 mt-3 text-[13px] leading-snug text-[var(--color-faint)]">
            {top.toFixed(0)}% of this position sits with a single issuer.
          </p>
        )}
      </section>
    </Screen>
  );
}
