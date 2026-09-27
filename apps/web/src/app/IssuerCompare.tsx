import type { Decision, PricedCandidate } from "@mercury/core";
import type { Wrapper } from "../market/hooks";

export const ISSUER_NAME = { backed: "Backed", ondo: "Ondo" } as const;

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

const REJECTION: Record<string, string> = {
  no_route: "No route at this size",
  impact_too_high: "Would move the price too far",
  zero_output: "Route returns nothing",
};

type Verdict = "best" | "dearer" | "refused";

const verdictOf = (c: PricedCandidate, best: PricedCandidate | null): Verdict => {
  if (!c.viable) return "refused";
  return best && c.mint === best.mint ? "best" : "dearer";
};

const LABEL: Record<Verdict, string> = {
  best: "Best",
  dearer: "Tradable",
  refused: "Refused",
};

const CHIP: Record<Verdict, string> = {
  best: "bg-up text-white",
  dearer: "bg-chip text-ink-soft",
  refused: "border border-down-line text-down-deep",
};

/**
 * Both issuers, priced per real share rather than per token, for the amount the
 * user is actually about to spend. Three states, because "tradable but dearer"
 * is a real outcome and not a failure.
 */
export const IssuerCompare = ({
  decision,
  amount,
  loading = false,
  wrappers = [],
}: {
  decision: Decision | null;
  amount: number;
  loading?: boolean;
  wrappers?: readonly Wrapper[];
}) => {
  if (!decision)
    return (
      <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
        <div className="border-b border-hair px-5 pt-4 pb-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
            {loading ? "Quoting every issuer…" : "No quote yet"}
          </h2>
        </div>
        {(wrappers.length > 0 ? wrappers : [null, null]).map((w, i) => (
          <div key={w?.mint ?? i} className="border-b border-hair px-5 py-3 last:border-b-0">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[14px] font-medium">
                {w?.symbol ?? <span className="inline-block h-4 w-16 rounded bg-chip align-middle" />}
              </span>
              <span className="ml-auto inline-block h-6 w-16 rounded-md bg-chip" />
            </span>
            <span className="mt-2 flex items-end justify-between">
              <span className="inline-block h-3.5 w-24 rounded bg-shell" />
              <span className="inline-block h-4 w-28 rounded bg-chip" />
            </span>
          </div>
        ))}
      </section>
    );

  const best = decision.kind === "refuse" ? null : decision.best;
  const bestPrice = best?.pricePerShare ? Number(best.pricePerShare.toString()) : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
          {decision.candidates.length > 1 ? "Where your order goes" : "Your route"}
        </h2>
        <span className="text-[12px] text-faint">Quoted for {usd(amount)}</span>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_76px] gap-3 border-y border-hair bg-shell/60 px-5 py-2 text-[11px] font-medium tracking-[0.03em] text-faint uppercase sm:grid">
        <span>Token</span>
        <span className="text-right">Shares per token</span>
        <span className="text-right">Impact</span>
        <span className="text-right">Per share</span>
        <span />
      </div>

      {decision.candidates.map((c) => {
        const verdict = verdictOf(c, best);
        const price = c.pricePerShare ? Number(c.pricePerShare.toString()) : null;
        const impact = c.priceImpact ? Number(c.priceImpact.toString()) : null;
        const dearer =
          verdict === "dearer" && price !== null && bestPrice !== null ? (price / bestPrice - 1) * 100 : null;

        return (
          <div
            key={c.mint}
            className="grid grid-cols-[minmax(0,1fr)_auto_76px] items-center gap-3 border-b border-hair px-5 py-2.5 text-[13px] last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_76px]"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono font-medium">{c.symbol}</span>
              <span className="block truncate text-[11px] text-faint">{ISSUER_NAME[c.issuer]}</span>
            </span>
            <span className="hidden text-right font-mono text-[12px] text-muted sm:block">
              ×{Number(c.multiplier.toString()).toFixed(4)}
            </span>
            <span className="hidden text-right text-muted sm:block">
              {impact === null ? "No route" : `${(impact * 100).toFixed(2)}%`}
            </span>
            <span className="text-right">
              <span
                className={`block font-semibold ${
                  verdict === "best" ? "text-up-deep" : verdict === "refused" ? "text-down-deep" : ""
                }`}
              >
                {price === null ? "—" : usd(price)}
              </span>
              {dearer !== null && dearer >= 0.01 && (
                <span className="block text-[11px] text-faint">
                  +{dearer.toFixed(dearer < 10 ? 2 : 0)}% dearer
                </span>
              )}
            </span>
            <span
              className={`justify-self-end rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] uppercase ${CHIP[verdict]}`}
            >
              {LABEL[verdict]}
            </span>
          </div>
        );
      })}

      <p className="border-t border-hair bg-shell/60 px-5 py-2.5 text-[11px] leading-[1.5] text-muted">
        {decision.candidates.some((c) => !c.viable) &&
          `${decision.candidates
            .filter((c) => !c.viable)
            .map((c) => `${c.symbol}: ${REJECTION[c.rejection ?? ""] ?? "unusable"}`)
            .join(" · ")}. `}
        Prices are per real share, corrected by each token's multiplier, and re-quoted whenever the amount
        changes.
      </p>
    </section>
  );
};
