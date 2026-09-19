import type { Decision, PricedCandidate } from "@harbor/core";
import { toWire } from "@harbor/core";
import type { Decision as WireDecision, PricedCandidate as WirePricedCandidate } from "@harbor/types";

/**
 * Domain to wire. Every Decimal becomes a decimal string, because money never crosses
 * a boundary as a number. See docs/05.
 */
const candidate = (c: PricedCandidate): WirePricedCandidate => ({
  mint: c.mint,
  symbol: c.symbol,
  issuer: c.issuer,
  multiplier: toWire(c.multiplier),
  pricePerToken: c.pricePerToken === null ? null : toWire(c.pricePerToken),
  pricePerShare: c.pricePerShare === null ? null : toWire(c.pricePerShare),
  priceImpact: c.priceImpact === null ? null : toWire(c.priceImpact),
  routeLabels: [...c.routeLabels],
  viable: c.viable,
  rejection: c.rejection,
});

export const decisionToWire = (d: Decision): WireDecision => {
  const base = {
    ticker: d.ticker,
    side: d.side,
    amount: toWire(d.amount),
    fairPricePerShare: toWire(d.fairPricePerShare),
    status: d.status,
    candidates: d.candidates.map(candidate),
    decidedAt: d.decidedAt.toISOString(),
  };

  switch (d.kind) {
    case "execute":
      return { ...base, kind: "execute", best: candidate(d.best), premium: toWire(d.premium), warning: d.warning };
    case "offer_queue":
      return {
        ...base,
        kind: "offer_queue",
        best: candidate(d.best),
        premium: toWire(d.premium),
        suggestedTriggerPricePerShare: toWire(d.suggestedTriggerPricePerShare),
        marketOpensAt: d.marketOpensAt === null ? null : d.marketOpensAt.toISOString(),
      };
    case "refuse":
      return { ...base, kind: "refuse", reason: d.reason, detail: d.detail };
  }
};
