import type { Decision, PricedCandidate } from "@mercury/core";
import type { Wrapper } from "../../market/hooks";
import { InfoTip, RailHead, StatusChip, type Tone } from "../../ui/ds";
import { ISSUER_NAME } from "../IssuerCompare";
import { usd } from "@mercury/view";
import { Skeleton } from "../portfolio/ui";

const REJECTION: Record<string, string> = {
  no_route: "No route at this size",
  impact_too_high: "Would move the price too far",
  zero_output: "Route returns nothing",
};

type Verdict = "best" | "dearer" | "refused";

/*
 * "Not used" rather than "Refused": the table asks where your order goes, and
 * this is the row it does not go to. Refusal is our word for the rule that
 * fired, not the reader's for what happened.
 *
 * Deliberately not naming the cause here — this verdict also covers a route
 * that does not exist and one that returns nothing, so "too expensive" would
 * be false for two of the three. The tip above the table names the actual
 * reason per token.
 */
const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  best: { label: "Best", tone: "up" },
  dearer: { label: "Tradable", tone: "neutral" },
  refused: { label: "Not used", tone: "down" },
};

const verdictOf = (c: PricedCandidate, best: PricedCandidate | null): Verdict =>
  !c.viable ? "refused" : best && c.mint === best.mint ? "best" : "dearer";

/** Token, shares per token, impact, per share, verdict: the holdings table's fixed right-hand columns. */
const COLS = "grid-cols-[minmax(0,1fr)_120px_100px_130px_88px]";

/**
 * Both issuers, priced per real share rather than per token, for the amount
 * about to be spent, laid out like the holdings table: the rail-card title
 * row, then a grey panel with the column labels and 60px rows. Three verdicts,
 * because "tradable but dearer" is a real outcome and not a failure.
 */
export const Routes = ({
  decision,
  amount,
  loading,
  wrappers,
}: {
  decision: Decision | null;
  amount: number;
  loading: boolean;
  wrappers: readonly Wrapper[];
}) => {
  const best = decision && decision.kind !== "refuse" ? decision.best : null;
  const bestPrice = best?.pricePerShare ? Number(best.pricePerShare.toString()) : null;
  const refused = decision?.candidates.filter((c) => !c.viable) ?? [];

  return (
    <section aria-label="Where your order goes" className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-3 sm:px-5 pt-4">
        <RailHead
          title={decision && decision.candidates.length === 1 ? "Your route" : "Where your order goes"}
          meta={
            <span className="flex min-w-0 items-center gap-2 text-ds-muted">
              <span className="truncate">
                {decision ? `Quoted for ${usd(amount)}` : loading ? "Quoting every issuer…" : "No quote yet"}
              </span>
              <InfoTip label="About these prices">
                {refused.length > 0 &&
                  `${refused.map((c) => `${c.symbol}: ${REJECTION[c.rejection ?? ""] ?? "unusable"}`).join(" · ")}. `}
                Prices are per real share, corrected by each token's multiplier, and re-quoted whenever the
                amount changes. The best route is raised in white.
              </InfoTip>
            </span>
          }
        />
      </div>

      <div className="mt-[11px] overflow-x-auto rounded-lg bg-ds-panel p-1">
        <div className="min-w-[560px]">
          <div className={`grid ${COLS} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}>
            <span>Token</span>
            <span className="text-right">Shares per token</span>
            <span className="text-right">Impact</span>
            <span className="text-right">Per share</span>
            <span />
          </div>

          <div className="flex flex-col gap-1">
            {!decision
              ? (wrappers.length ? wrappers : [null, null]).map((w, i) => (
                  <div
                    key={w?.mint ?? i}
                    className={`grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none`}
                  >
                    <span>
                      <span className="block font-medium text-ds-ink">
                        {w?.symbol ?? <Skeleton className="h-3.5 w-16" />}
                      </span>
                      <span className="mt-[6px] block text-[12px] text-ds-muted">
                        {w ? ISSUER_NAME[w.issuer] : <Skeleton className="h-3 w-12" />}
                      </span>
                    </span>
                    <Skeleton className="ml-auto h-3.5 w-14" />
                    <Skeleton className="ml-auto h-3.5 w-12" />
                    <Skeleton className="ml-auto h-3.5 w-16" />
                    <Skeleton className="ml-auto h-[17px] w-12" />
                  </div>
                ))
              : decision.candidates.map((c) => {
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
                      className={`grid h-15 ${COLS} items-center rounded-md px-4 text-[14px] leading-none ${
                        verdict === "best" ? "bg-white" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ds-ink">{c.symbol}</span>
                        <span className="mt-[6px] block truncate text-[12px] text-ds-muted">
                          {ISSUER_NAME[c.issuer]}
                        </span>
                      </span>
                      <span className="text-right text-ds-muted">
                        ×{Number(c.multiplier.toString()).toFixed(4)}
                      </span>
                      <span className="text-right text-ds-muted">
                        {impact === null ? "No route" : `${(impact * 100).toFixed(2)}%`}
                      </span>
                      <span className="text-right">
                        <span
                          className={`block font-medium ${
                            verdict === "best"
                              ? "text-ds-up"
                              : verdict === "refused"
                                ? "text-ds-down"
                                : "text-ds-ink"
                          }`}
                        >
                          {price === null ? "—" : usd(price)}
                        </span>
                        {dearer !== null && dearer >= 0.01 && (
                          <span className="mt-[6px] block text-[12px] text-ds-muted">
                            +{dearer.toFixed(dearer < 10 ? 2 : 0)}% dearer
                          </span>
                        )}
                      </span>
                      <span className="flex justify-end">
                        <StatusChip tone={VERDICT[verdict].tone}>{VERDICT[verdict].label}</StatusChip>
                      </span>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </section>
  );
};
