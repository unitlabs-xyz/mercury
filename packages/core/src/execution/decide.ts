import { D, ONE, ZERO, type Decimal } from "../money.js";
import type {
  Candidate,
  Decision,
  DecisionInput,
  PricedCandidate,
  RefuseDecision,
  ReferencePrice,
  Side,
  InstrumentStatus,
} from "./types.js";
import { TRADING_SESSIONS } from "./types.js";

/**
 * The fair value of one real share, including a dividend that has gone ex but is
 * not yet reflected in the token's multiplier.
 *
 * On 18 Sep 2026 SPY went ex-dividend $1.889. On 19 Sep the SPYx mint still carried
 * June's multiplier, so `underlying x multiplier` read 17.3 basis points low. That is
 * a sixth of our premium tolerance. See docs/04 and docs/11.
 */
export const fairPricePerShare = (reference: ReferencePrice): Decimal =>
  reference.pricePerShare.add(reference.pendingDividendNet);

const priceCandidate = (candidate: Candidate, side: Side, maxPriceImpact: Decimal): PricedCandidate => {
  const base = {
    mint: candidate.mint,
    symbol: candidate.symbol,
    issuer: candidate.issuer,
    multiplier: candidate.multiplier,
    routeLabels: candidate.quote?.routeLabels ?? [],
    quoteId: candidate.quote?.quoteId ?? null,
    quoteRaw: candidate.quote?.raw ?? null,
    /* The traded leg: tokens out on a buy, tokens in on a sell, either way
       corrected by the multiplier into shares. */
    filledShares:
      candidate.quote === null
        ? null
        : (side === "buy" ? candidate.quote.outAmount : candidate.quote.inAmount).mul(candidate.multiplier),
  };

  if (candidate.quote === null) {
    return {
      ...base,
      pricePerToken: null,
      pricePerShare: null,
      worstPricePerShare: null,
      priceImpact: null,
      viable: false,
      rejection: "no_route",
    };
  }

  const { inAmount, outAmount, minOutAmount, priceImpact } = candidate.quote;
  if (outAmount.lte(ZERO) || inAmount.lte(ZERO)) {
    return {
      ...base,
      pricePerToken: null,
      pricePerShare: null,
      worstPricePerShare: null,
      priceImpact,
      viable: false,
      rejection: "zero_output",
    };
  }

  // Buy: USD in, tokens out. Sell: tokens in, USD out.
  const pricePerToken = side === "buy" ? inAmount.div(outAmount) : outAmount.div(inAmount);

  // The correction that makes two issuers comparable. Without it the answer is wrong,
  // and on the S&P 500 it is wrong by more than three times the true gap. See docs/01.
  const pricePerShare = pricePerToken.div(candidate.multiplier);

  /*
   * The same arithmetic against the route's floor rather than its expectation.
   * A buy spends a fixed amount for at least `minOutAmount` tokens, so fewer
   * tokens is a dearer share; a sell delivers fixed tokens for at least
   * `minOutAmount` dollars, so that is the least it can fetch. Either way the
   * result is the side of the quote the user can actually be held to.
   */
  const worstPricePerShare = minOutAmount.lte(ZERO)
    ? null
    : (side === "buy" ? inAmount.div(minOutAmount) : minOutAmount.div(inAmount)).div(candidate.multiplier);

  if (priceImpact.gt(maxPriceImpact)) {
    return {
      ...base,
      pricePerToken,
      pricePerShare,
      worstPricePerShare,
      priceImpact,
      viable: false,
      rejection: "impact_too_high",
    };
  }

  return {
    ...base,
    pricePerToken,
    pricePerShare,
    worstPricePerShare,
    priceImpact,
    viable: true,
    rejection: null,
  };
};

const rank = (a: PricedCandidate, b: PricedCandidate, side: Side): number => {
  const pa = a.pricePerShare;
  const pb = b.pricePerShare;
  if (pa === null || pb === null) return 0;
  // Buy: cheapest per share first. Sell: most proceeds per share first.
  return side === "buy" ? pa.comparedTo(pb) : pb.comparedTo(pa);
};

const maxAgeSec = (status: InstrumentStatus, policy: DecisionInput["policy"]): number =>
  TRADING_SESSIONS.includes(status) ? policy.maxReferenceAgeSecOpen : policy.maxReferenceAgeSecClosed;

const deadAgeSec = (status: InstrumentStatus, policy: DecisionInput["policy"]): number =>
  TRADING_SESSIONS.includes(status) ? policy.deadReferenceAgeSecOpen : policy.deadReferenceAgeSecClosed;

/**
 * How much the premium tolerance widens for a reference this old.
 *
 * Zero while the reference is fresh, ramping to `referenceStaleMaxWidenBps` at
 * the age where the reference is abandoned altogether.
 *
 * The ramp exists because of what the gap actually contains. `premium` is the
 * route's price over the reference's, and once the reference is behind, part of
 * that gap is the market having moved since the reading rather than the pool
 * being dislocated. Measuring the second against a bar sized for the first
 * reports movement as dislocation. Widening with age is the honest way to say
 * "we are less sure", and it is bounded so the check cannot widen into
 * meaninglessness.
 *
 * Linear between the two bounds, and the bounds are session-dependent, so the
 * same ramp is steep during trading hours — where 300s to 3600s is the whole
 * range — and almost flat while the market is shut, where the range is days.
 * That matches the evidence: weekend drift was measured under 15 basis points,
 * so a reference that is two days old is not two days' worth of uncertain.
 */
export const staleWidening = (
  ageSec: number,
  status: InstrumentStatus,
  policy: DecisionInput["policy"],
): Decimal => {
  const fresh = maxAgeSec(status, policy);
  const dead = deadAgeSec(status, policy);
  if (ageSec <= fresh) return ZERO;
  // A dead bound at or below the fresh one would divide by zero or go
  // negative; the whole widening is then meaningless, so there is none.
  if (dead <= fresh) return ZERO;
  const through = Math.min((ageSec - fresh) / (dead - fresh), 1);
  return D(policy.referenceStaleMaxWidenBps).div(10_000).mul(through);
};

export function decide(input: DecisionInput): Decision {
  const { side, policy, status, reference, now } = input;
  const fair = fairPricePerShare(reference);

  const priced = input.candidates.map((c) => priceCandidate(c, side, policy.maxPriceImpact));

  const refuse = (reason: RefuseDecision["reason"], detail: string): RefuseDecision => ({
    kind: "refuse",
    reason,
    detail,
    ticker: input.ticker,
    side,
    amount: input.amount,
    fairPricePerShare: fair,
    status,
    candidates: priced,
    decidedAt: now,
    maxSlippageBps: policy.slippageBps,
  });

  // 1. Guards that do not depend on any quote.
  /*
   * The minimum is a rule about committing new money, and it does not survive
   * being turned around. Applied to a sell it would mean a position worth less
   * than the floor could never be closed — and dividends keep adding to it, so
   * the trap fills rather than drains.
   *
   * A sell has one floor and it is physics rather than policy: the proceeds
   * have to cover the network fee. Only the relay knows that fee, so only the
   * relay can enforce it.
   */
  if (side === "buy" && input.amount.lt(policy.minOrderUsd)) {
    return refuse("below_minimum", `Minimum order is $${policy.minOrderUsd.toFixed(2)}.`);
  }
  if (status === "halted") {
    return refuse("instrument_halted", "The issuer has paused this token.");
  }
  if (status === "corp_action_pending" && policy.blockOnCorpActionPending) {
    return refuse(
      "corp_action_pending",
      "A dividend has gone ex but is not yet reflected in the token. Pricing is unreliable until it is.",
    );
  }

  /*
   * An old reference widens the tolerance; it does not close the door.
   *
   * It used to refuse, which was the wrong shape twice over. It was stricter
   * than the thing it guards — a *fresh* reference saying the route is 3% over
   * fair value is a warning the user may act on (see §4), while a reference
   * merely 301 seconds old stopped them dead. And it refused sells, which §4
   * says in as many words we must not do: "wait for New York to open" is not a
   * remedy available to someone who needs their money back at 2am.
   *
   * It also could not work. The issuer's feed freezes when the underlying
   * market closes — measured on 9 October 2026, the quote stopped advancing at
   * the 20:00 UTC close and its age then grew without bound — so a bar of 900s
   * refused every order from a quarter past the close until the next session.
   * xStocks trade around the clock; the shares behind them do not, and no feed
   * anywhere can make a Saturday price exist. A freshness bar no source can
   * meet is not a safety property.
   *
   * What the reference actually guards against is persistent dislocation
   * between the pool and the real share price, which moves over hours. The
   * risks that move in seconds are already bounded by `maxPriceImpact` from the
   * quote itself and by `slippageBps` on chain, and neither reads this.
   */
  const ageSec = (now.getTime() - reference.observedAt.getTime()) / 1000;
  if (status === "stale") {
    return refuse("reference_stale", "We cannot tell whether this market is open.");
  }
  if (ageSec > deadAgeSec(status, policy)) {
    return refuse(
      "reference_stale",
      `The reference price is ${Math.round(ageSec / 3600)}h old, which is too old to price against.`,
    );
  }
  const tolerance = policy.premiumTolerance.add(staleWidening(ageSec, status, policy));
  if (priced.length === 0) {
    /* Two different facts wear the same refusal. A buy has nothing to buy
       because no wrapper is registered; a sell has nothing to sell because the
       wallet holds none of the ones that are. */
    return refuse(
      "no_candidates",
      side === "sell"
        ? "You do not hold this stock in a wallet we can sell from."
        : "No wrapper is registered for this instrument.",
    );
  }

  // 2. Survivors, ranked.
  const survivors = priced.filter((c) => c.viable).sort((a, b) => rank(a, b, side));
  const best = survivors[0];

  if (best === undefined || best.pricePerShare === null) {
    const everyoneRouteless = priced.every((c) => c.rejection === "no_route");
    return refuse(
      everyoneRouteless ? "no_route" : "impact_too_high",
      everyoneRouteless
        ? "No issuer has a route for this instrument at this size."
        : "Every issuer would move the price too far at this size. Try a smaller amount.",
    );
  }

  // 3. Premium against fair value, signed so that positive always means worse for the user.
  const premium = best.pricePerShare.div(fair).sub(ONE);
  const adverse = side === "buy" ? premium : premium.neg();

  const shared = {
    ticker: input.ticker,
    side,
    amount: input.amount,
    fairPricePerShare: fair,
    status,
    candidates: priced,
    decidedAt: now,
    maxSlippageBps: policy.slippageBps,
    best,
    premium,
  };

  if (adverse.lte(tolerance)) {
    return { ...shared, kind: "execute", warning: null };
  }

  /*
   * 4. Out of tolerance. While the market is open the gap should close quickly,
   *    so we warn and let them proceed. While it is shut there is no arbitrage
   *    to close it, so a buy is offered the wait instead. See docs/04.
   *
   *    A sell is never offered the wait. Refusing a buy costs someone a
   *    purchase they can make tomorrow; refusing a sell tells someone they
   *    cannot have their own money back, and "wait for New York to open" is
   *    not a remedy available to everyone who needs to sell at 2am.
   */
  if (side === "sell" || TRADING_SESSIONS.includes(status)) {
    const pct = adverse.mul(100).toFixed(2);
    return {
      ...shared,
      kind: "execute",
      warning:
        side === "buy"
          ? `This is ${pct}% above the real share price.`
          : TRADING_SESSIONS.includes(status)
            ? `This is ${pct}% below the real share price.`
            : `This is ${pct}% below the real share price, and the US market is shut. The gap usually closes when it opens.`,
    };
  }

  const trigger = side === "buy" ? fair.mul(ONE.add(tolerance)) : fair.mul(ONE.sub(tolerance));

  return {
    ...shared,
    kind: "offer_queue",
    suggestedTriggerPricePerShare: trigger,
    marketOpensAt: input.marketOpensAt ?? null,
  };
}

/** True when a naive comparison of raw token prices would pick a different wrapper. */
export const multiplierChangesTheAnswer = (candidates: readonly PricedCandidate[], side: Side): boolean => {
  const usable = candidates.filter((c) => c.viable && c.pricePerShare !== null && c.pricePerToken !== null);
  if (usable.length < 2) return false;
  const byShare = [...usable].sort((a, b) => rank(a, b, side))[0];
  const byToken = [...usable].sort((a, b) => {
    const pa = a.pricePerToken;
    const pb = b.pricePerToken;
    if (pa === null || pb === null) return 0;
    return side === "buy" ? pa.comparedTo(pb) : pb.comparedTo(pa);
  })[0];
  return byShare?.mint !== byToken?.mint;
};

export { D, ZERO };
