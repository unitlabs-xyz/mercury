import { D, DEFAULT_POLICY, decide, type Candidate, type Decision, type Side } from "@harbor/core";
import { MARKET, findInstrument, type Instrument } from "./data";

/**
 * The interface runs against the real execution engine from `@harbor/core`, fed with
 * dummy quotes. The decision logic on screen is therefore the production logic: the
 * multiplier correction, the impact ceiling, the premium gate and the three outcomes.
 * Only the quotes are invented, and they are the measured ones.
 */
export function quoteFor(ticker: string, side: Side, amount: number): { decision: Decision; instrument: Instrument } | null {
  const instrument = findInstrument(ticker);
  if (instrument === undefined) return null;

  const candidates: Candidate[] = instrument.wrappers.map((w) => {
    const pricePerToken = D(w.pricePerShare).mul(w.multiplier);
    const inAmount = D(amount);
    return {
      mint: w.mint,
      symbol: w.symbol,
      issuer: w.issuer,
      multiplier: D(w.multiplier),
      quote: {
        inAmount,
        outAmount: side === "buy" ? inAmount.div(pricePerToken) : inAmount.mul(pricePerToken),
        priceImpact: D(w.priceImpact),
        routeLabels: [w.route],
        quoteId: `${w.symbol}-${amount}`,
        expiresAt: new Date(Date.now() + 30_000),
      },
    };
  });

  const decision = decide({
    ticker: instrument.ticker,
    side,
    amount: D(amount),
    candidates,
    reference: {
      pricePerShare: D(instrument.pricePerShare),
      observedAt: new Date(Date.now() - 4_000),
      pendingDividendNet: D(0),
    },
    status: MARKET.status,
    policy: DEFAULT_POLICY,
    now: new Date(),
    marketOpensAt: new Date(MARKET.nextOpenAt),
  });

  return { decision, instrument };
}

export const num = (v: { toFixed: (n: number) => string } | null, dp = 2): number =>
  v === null ? 0 : Number(v.toFixed(dp + 6));
