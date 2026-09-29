import { DEFAULT_POLICY, D, decide, type Candidate, type Decision, type Side } from "@mercury/core";
import type { Deps } from "./deps.js";

export interface PriceRequest {
  readonly ticker: string;
  readonly side: Side;
  /** USD for a buy, shares for a sell. */
  readonly amount: string;
}

/**
 * Gather every wrapper's quote, the reference price and the session, then let
 * `@mercury/core` decide. Nothing here makes a judgement; that all lives in `decide`.
 */
export async function priceOrder(deps: Deps, req: PriceRequest): Promise<Decision | null> {
  const [wrappers, reference, session] = await Promise.all([
    deps.registry.wrappersFor(req.ticker),
    deps.reference.priceFor(req.ticker),
    deps.sessions.current(),
  ]);

  if (reference === null || wrappers.length === 0) return null;
  const amount = D(req.amount);

  const candidates: Candidate[] = await Promise.all(
    wrappers.map(async (w) => {
      const [quote, multiplier, paused] = await Promise.all([
        // Slippage is a policy number, not an adapter default: it is spent from
        // the same budget as the premium tolerance, so the policy names it.
        deps.quotes.quote({
          side: req.side,
          mint: w.mint,
          decimals: w.decimals,
          amount,
          slippageBps: DEFAULT_POLICY.slippageBps,
        }),
        deps.multipliers.multiplierFor(w.mint),
        deps.multipliers.isPaused(w.mint),
      ]);
      return {
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        multiplier: multiplier ?? D(1),
        quote: paused ? null : quote,
      };
    }),
  );

  const anyPaused = candidates.every((c) => c.quote === null);

  return decide({
    ticker: req.ticker,
    side: req.side,
    amount,
    candidates,
    reference,
    status: anyPaused ? "halted" : session.status,
    policy: DEFAULT_POLICY,
    now: new Date(),
    ...(session.nextOpenAt !== null ? { marketOpensAt: session.nextOpenAt } : {}),
  });
}
