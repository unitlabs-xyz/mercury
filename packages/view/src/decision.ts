import { D, type Decision, type PricedCandidate } from "@mercury/core";
import type { Decision as WireDecision } from "@mercury/types";

/**
 * A decision as the server sends it, back into the one the screens read.
 *
 * Two types carry the same idea: `@mercury/types` speaks in decimal strings,
 * because money does not cross a boundary as a number, and `@mercury/core`
 * speaks in Decimals, because that is what arithmetic needs. The server owns
 * the outbound half in `services/api/src/serialize.ts`; this is the inbound.
 *
 * `quoteId` and `quoteRaw` come back null, and always will. They are how a
 * quote is redeemed for a transaction, and the server never sends them — so a
 * decision that arrived over the wire can be shown and never executed from.
 * Null rather than absent, because that is what the type says and because a
 * missing field would read as an oversight instead of a rule.
 */
const candidate = (c: WireDecision["candidates"][number]): PricedCandidate => ({
  mint: c.mint,
  symbol: c.symbol,
  issuer: c.issuer,
  multiplier: D(c.multiplier),
  pricePerToken: c.pricePerToken === null ? null : D(c.pricePerToken),
  pricePerShare: c.pricePerShare === null ? null : D(c.pricePerShare),
  worstPricePerShare: c.worstPricePerShare === null ? null : D(c.worstPricePerShare),
  filledShares: c.filledShares === null ? null : D(c.filledShares),
  priceImpact: c.priceImpact === null ? null : D(c.priceImpact),
  routeLabels: c.routeLabels,
  viable: c.viable,
  rejection: c.rejection,
  quoteId: null,
  quoteRaw: null,
});

export const decisionFromWire = (w: WireDecision): Decision => {
  const base = {
    ticker: w.ticker,
    side: w.side,
    amount: D(w.amount),
    fairPricePerShare: D(w.fairPricePerShare),
    status: w.status,
    candidates: w.candidates.map(candidate),
    decidedAt: new Date(w.decidedAt),
    maxSlippageBps: w.maxSlippageBps,
  };

  if (w.kind === "refuse") return { ...base, kind: "refuse", reason: w.reason, detail: w.detail };
  if (w.kind === "offer_queue") {
    return {
      ...base,
      kind: "offer_queue",
      best: candidate(w.best),
      premium: D(w.premium),
      suggestedTriggerPricePerShare: D(w.suggestedTriggerPricePerShare),
      marketOpensAt: w.marketOpensAt === null ? null : new Date(w.marketOpensAt),
    };
  }
  return { ...base, kind: "execute", best: candidate(w.best), premium: D(w.premium), warning: w.warning };
};
