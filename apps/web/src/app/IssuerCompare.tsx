import type { Decision, PricedCandidate } from "@harbor/core";
import { ISSUER_NAME } from "./market";

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
export const IssuerCompare = ({ decision, amount }: { decision: Decision; amount: number }) => {
  const best = decision.kind === "refuse" ? null : decision.best;
  const bestPrice = best?.pricePerShare ? Number(best.pricePerShare.toString()) : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hair px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold">
          {decision.candidates.length > 1 ? "We checked both issuers" : "We checked every issuer"}
        </h2>
        <span className="rounded-full bg-chip px-2.5 py-1 text-[12px] font-medium text-ink-soft">
          for {usd(amount)}
        </span>
      </div>

      {decision.candidates.map((c) => {
        const verdict = verdictOf(c, best);
        const price = c.pricePerShare ? Number(c.pricePerShare.toString()) : null;
        const impact = c.priceImpact ? Number(c.priceImpact.toString()) : null;
        const dearer =
          verdict === "dearer" && price !== null && bestPrice !== null
            ? (price / bestPrice - 1) * 100
            : null;

        return (
          <div
            key={c.mint}
            className="border-b border-hair px-5 py-4 last:border-b-0 sm:px-6"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[14px] font-medium">{c.symbol}</span>
              <span className="truncate text-[13px] text-muted">{ISSUER_NAME[c.issuer]}</span>
              <span
                className={`ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold tracking-[0.04em] uppercase ${CHIP[verdict]}`}
              >
                {LABEL[verdict]}
              </span>
            </div>

            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="shrink-0 font-mono text-[12px] whitespace-nowrap text-faint">
                ×{Number(c.multiplier.toString()).toFixed(6)}
                <span className="hidden sm:inline"> per token</span>
              </span>
              <span className="text-right">
                <span
                  className={`block text-[15px] font-semibold tabular-nums ${
                    verdict === "best" ? "text-up-deep" : verdict === "refused" ? "text-down-deep" : ""
                  }`}
                >
                  {price === null ? "—" : `${usd(price)} per share`}
                </span>
                <span className="mt-0.5 block text-[12px] tabular-nums text-muted">
                  {impact === null ? "no route" : `${(impact * 100).toFixed(2)}% impact`}
                  {dearer !== null && dearer >= 0.01 && (
                    <> · +{dearer.toFixed(dearer < 10 ? 2 : 0)}% dearer</>
                  )}
                </span>
              </span>
            </div>
          </div>
        );
      })}

      <p className="border-t border-hair bg-shell px-5 py-3.5 text-[13px] leading-[1.5] text-muted sm:px-6">
        {decision.candidates.some((c) => !c.viable) ? (
          <>
            {decision.candidates
              .filter((c) => !c.viable)
              .map((c) => `${c.symbol}: ${REJECTION[c.rejection ?? ""] ?? "unusable"}`)
              .join(" · ")}
            . Prices are per real share, corrected by each token's multiplier — comparing raw
            token prices gets the answer wrong.
          </>
        ) : (
          <>
            Prices are per real share, corrected by each token's multiplier — comparing raw token
            prices gets the answer wrong. It is worked out again whenever you change the amount.
          </>
        )}
      </p>
    </section>
  );
};
