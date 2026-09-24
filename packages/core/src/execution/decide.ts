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
  };

  if (candidate.quote === null) {
    return {
      ...base,
      pricePerToken: null,
      pricePerShare: null,
      priceImpact: null,
      viable: false,
      rejection: "no_route",
    };
  }

  const { inAmount, outAmount, priceImpact } = candidate.quote;
  if (outAmount.lte(ZERO) || inAmount.lte(ZERO)) {
    return {
      ...base,
      pricePerToken: null,
      pricePerShare: null,
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

  if (priceImpact.gt(maxPriceImpact)) {
    return {
      ...base,
      pricePerToken,
      pricePerShare,
      priceImpact,
      viable: false,
      rejection: "impact_too_high",
    };
  }

  return { ...base, pricePerToken, pricePerShare, priceImpact, viable: true, rejection: null };
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
  });

  // 1. Guards that do not depend on any quote.
  const notionalUsd = side === "buy" ? input.amount : input.amount.mul(fair);
  if (notionalUsd.lt(policy.minOrderUsd)) {
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

  const ageSec = (now.getTime() - reference.observedAt.getTime()) / 1000;
  if (status === "stale" || ageSec > maxAgeSec(status, policy)) {
    return refuse(
      "reference_stale",
      `The reference price is ${Math.round(ageSec)}s old and cannot be trusted.`,
    );
  }
  if (priced.length === 0) {
    return refuse("no_candidates", "No wrapper is registered for this instrument.");
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
    best,
    premium,
  };

  if (adverse.lte(policy.premiumTolerance)) {
    return { ...shared, kind: "execute", warning: null };
  }

  // 4. Out of tolerance. While the market is open the gap should close quickly, so we
  //    warn and let them proceed. While it is shut there is no arbitrage to close it,
  //    so we offer to wait. See docs/04.
  if (TRADING_SESSIONS.includes(status)) {
    return {
      ...shared,
      kind: "execute",
      warning:
        side === "buy"
          ? `This is ${adverse.mul(100).toFixed(2)}% above the real share price.`
          : `This is ${adverse.mul(100).toFixed(2)}% below the real share price.`,
    };
  }

  const trigger =
    side === "buy" ? fair.mul(ONE.add(policy.premiumTolerance)) : fair.mul(ONE.sub(policy.premiumTolerance));

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
