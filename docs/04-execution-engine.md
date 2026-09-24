# 04 · Execution engine

The core of the product. Everything else is a screen around this.

Lives in `packages/core`, performs no I/O, and is the most heavily tested code in the repo.

## The problem it solves

The same stock exists as several tokens from different issuers. They are not interchangeable:
each carries its own multiplier, and their liquidity differs by orders of magnitude. On our
measurements, buying $1,000 of Nvidia through the wrong wrapper costs $1,524 per share instead
of $222. Separately, all of them trade while the US market is shut, so the price can drift away
from the real share price with no arbitrage to pull it back.

The engine answers one question: **given a user, a ticker and a dollar amount, what is the right
thing to do right now?**

## Inputs

```ts
type DecisionInput = {
  ticker: string;
  side: "buy" | "sell";
  usdAmount: Decimal;
  candidates: Candidate[]; // one per wrapper, quoted at this size
  reference: ReferencePrice; // real share price, its freshness, and any pending dividend
  status: InstrumentStatus; // see below
  policy: ExecutionPolicy; // tolerances, defaults below
};

type Candidate = {
  mint: string;
  issuer: "backed" | "ondo";
  multiplier: Decimal; // shares represented by one token
  quote: Quote | null; // null when there is no route
};

type InstrumentStatus =
  | "open" // regular session
  | "premarket"
  | "postmarket"
  | "overnight"
  | "closed" // weekend or holiday
  | "halted" // issuer paused the token, read from Token-2022 Pausable
  | "stale" // the reference price is too old to trust
  | "corp_action_pending"; // ex-dividend has happened, the multiplier has not caught up

type ReferencePrice = {
  pricePerShare: Decimal; // from Chainlink, per ADR 0006
  observedAt: Date;
  pendingDividendNet: Decimal; // gross dividend less withholding, 0 most of the time
};

type Quote = {
  tokensOut: Decimal; // for a buy
  priceImpactPct: Decimal;
  routeLabels: string[];
  quoteId: string;
  expiresAt: Date;
};
```

## Policy defaults

| Setting                      | Default                          | Why                                                                                         |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `maxPriceImpactPct`          | 1.5%                             | Above this the book is too thin to be a fair price                                          |
| `premiumTolerancePct`        | 1.0%                             | Measured weekend drift is under 0.15%, so 1% is generous and only fires on real dislocation |
| `maxReferenceAgeSec`         | 120 while open, 900 while closed | A stale reference is worse than none                                                        |
| `minOrderUsd`                | 5                                | Below this, fees dominate                                                                   |
| `issuerConcentrationWarnPct` | 80%                              | Position-level warning, does not block                                                      |
| `blockOnCorpActionPending`   | true                             | See the dividend window below                                                               |

All overridable per user. None of them live in the UI in version one.

## Procedure

```
1  Reject the order outright if:
     usdAmount < policy.minOrderUsd
     status is "halted"
     status is "stale", or reference.observedAt is older than policy.maxReferenceAgeSec
     status is "corp_action_pending" and policy.blockOnCorpActionPending

2  For each candidate with a quote:
     pricePerToken = usdAmount / quote.tokensOut
     pricePerShare = pricePerToken / candidate.multiplier        ← the correction
     viable        = quote.priceImpactPct <= policy.maxPriceImpactPct

3  survivors = candidates where viable
   if survivors is empty → REFUSE, listing each candidate and why it failed

4  best = survivors sorted by pricePerShare ascending, first

5  fairPricePerShare = reference.pricePerShare + reference.pendingDividendNet
   premium           = (best.pricePerShare / fairPricePerShare) - 1

6  Decide:
     premium <= policy.premiumTolerancePct           → EXECUTE
     premium >  tolerance and status is "open"       → EXECUTE_WITH_WARNING
     premium >  tolerance and status is not "open"   → OFFER_QUEUE
     premium <  -tolerance                           → EXECUTE, note the discount

7  Return the decision with every candidate, its price per share, its impact and
   whether it survived. The UI shows this. It is the product's main claim.
```

Step 2's division by the multiplier is the line that makes the comparison correct. Without it the
answer is wrong, and on the S&P 500 it is wrong by more than three times the true gap.

## The dividend window, and why step 5 has an extra term

When a stock goes ex-dividend its share price drops by the dividend. The token holder is still
entitled to that money, and the issuer will eventually fold it into the multiplier. Between those
two moments, `underlying × multiplier` understates what the token is worth by the net dividend.

This is not theoretical. On 18 September 2026 SPY went ex-dividend $1.889. On 19 September the
SPYx mint still carried June's multiplier of 1.005714, and a naive oracle read 17.3 basis points
low. That is a sixth of our entire premium tolerance, and it would have made the gate misfire on
every S&P 500 order for as long as the window lasted.

```
netDividend = grossDividend × (1 − withholdingRate)     // 30% for non-US holders
fairPrice   = underlying × multiplier + netDividend
17.3bp      = 1.889 × 0.7 / 764
```

Using Chainlink protects us, because it was measured at 0.8 basis points from fair during exactly
this window while the raw DEX price was 20 basis points off. The `corp_action_pending` status and
the `pendingDividendNet` term exist anyway, because a fallback source must never quietly be
wrong. Credit to the Rambu project for finding this; see [11 References](11-references.md).

## Outcomes

```ts
type Decision =
  | { kind: "execute"; best: PricedCandidate; premiumPct: Decimal; warning?: string }
  | {
      kind: "offer_queue";
      best: PricedCandidate;
      premiumPct: Decimal;
      suggestedTriggerPrice: Decimal;
      marketOpensAt: Date;
    }
  | { kind: "refuse"; reason: RefuseReason; candidates: PricedCandidate[] };

type RefuseReason =
  | "below_minimum"
  | "no_route"
  | "impact_too_high"
  | "reference_stale"
  | "instrument_halted"
  | "corp_action_pending"
  | "not_eligible";
```

Every outcome carries the full candidate list. The user is always shown what was checked.

## Queued orders

When the user accepts a queue we place a **Jupiter trigger order** at the reference price plus a
small tolerance. Jupiter keepers monitor the price on chain and fill it when the condition is
met, splitting into chunks if liquidity is thin.

This matters more than it sounds: **the order does not depend on our server being alive.** If the
API is down, the laptop is shut, or the session has expired, a queued purchase still fills. It is
the same conclusion Robinhood reached for its own overnight session, which accepts limit orders
only.

Order lifecycle:

```
created → queued → filled
                 → partially_filled → filled
                 → expired    (user chooses to retry or cancel)
                 → cancelled  (by the user)
```

The worker polls trigger order state every sixty seconds and records fills as ordinary lots.

## Selling

The same procedure inverted. Candidates are the wrappers the user actually holds, `usdAmount`
becomes a share count, and the comparison ranks by proceeds per share descending. One extra
rule: **prefer selling the wrapper with the worse forward liquidity**, all else close, so the
user is left holding the more liquid one. That is a genuinely better outcome and costs nothing.

## Baskets

A basket purchase is N ordinary decisions, one per constituent, weighted by the basket's
allocation.

- Run all N decisions first, execute none.
- If any leg returns `refuse`, refuse the whole basket. Do not silently rebalance into the
  remaining names, because the user chose a set of weights and would not know it changed.
- If any leg returns `offer_queue`, present it as one choice for the whole basket: execute the
  legs that are fine and queue the rest, or queue everything.
- Rounding goes to the smallest allocation last, so dust lands where it matters least.

## Testing

`packages/core` is pure, so the test suite is a table of fixtures. Cases that must exist:

- The Nvidia case: one wrapper at 0.02% impact, one at 85%. Assert the cheap one wins and the
  reason string names the other.
- The S&P 500 case: both wrappers viable, multipliers 1.005715 and 1.009473. Assert the ranking
  uses per-share price, and assert the naive comparison would have picked differently.
- Weekend premium at 1.09%, market closed. Assert `offer_queue`.
- Same premium, market open. Assert `execute_with_warning`.
- All candidates over the impact ceiling. Assert `refuse` with `impact_too_high` and both
  candidates returned.
- Reference price 20 minutes stale while the market is open. Assert `refuse`.
- A basket where one of six legs has no route. Assert the whole basket refuses.
- Multiplier of exactly 1.0 and a multiplier of 10.0, the stock-split case, price the same.
- **The SPY dividend window.** Reference $764.065, multiplier 1.005714, pending net dividend
  $1.32. Assert the fair price includes the dividend, assert a quote that looks 0.9% rich against
  the naive price is only 0.7% rich against fair, and assert the status blocks when
  `blockOnCorpActionPending` is set.
- Status `halted` with an otherwise perfect quote. Assert `refuse`.
