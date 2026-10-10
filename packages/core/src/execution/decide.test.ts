import { describe, expect, it } from "vitest";
import { D, asBps, fromPct } from "../money.js";
import { decide, fairPricePerShare, multiplierChangesTheAnswer, staleWidening } from "./decide.js";
import { DEFAULT_POLICY, withPolicy } from "./policy.js";
import {
  NVDA_CANDIDATES,
  NVDA_SELL_CANDIDATES,
  SPY_CANDIDATES,
  buyInput,
  quote,
  reference,
  sellInput,
} from "./fixtures.js";

describe("wrapper selection", () => {
  it("picks Backed over Ondo for Nvidia and says why the other was refused", () => {
    const d = decide(buyInput());
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;

    expect(d.best.symbol).toBe("NVDAx");
    expect(d.best.pricePerShare?.toFixed(2)).toBe("222.33");

    const ondo = d.candidates.find((c) => c.symbol === "NVDAon");
    expect(ondo?.viable).toBe(false);
    expect(ondo?.rejection).toBe("impact_too_high");
    // The whole reason the product exists: $1,524 a share against $222.
    expect(ondo?.pricePerShare?.toFixed(0)).toBe("1524");
  });

  it("ranks by price per share, so the multiplier decides the S&P 500 answer", () => {
    const d = decide(buyInput({ ticker: "SPY", candidates: SPY_CANDIDATES, reference: reference(764.065) }));
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;

    const backed = d.candidates.find((c) => c.symbol === "SPYx");
    const ondo = d.candidates.find((c) => c.symbol === "SPYon");

    // Raw token prices say Backed is ~0.48% cheaper. Per share it is only ~0.11%.
    const rawGap = ondo!.pricePerToken!.div(backed!.pricePerToken!).sub(1);
    const trueGap = ondo!.pricePerShare!.div(backed!.pricePerShare!).sub(1);
    expect(asBps(rawGap).toNumber()).toBeGreaterThan(asBps(trueGap).toNumber() * 3);

    expect(d.best.symbol).toBe("SPYx");
    expect(backed!.pricePerShare!.toFixed(2)).toBe("764.21");
    expect(ondo!.pricePerShare!.toFixed(2)).toBe("765.03");
  });

  it("refuses when every wrapper moves the price too far", () => {
    const thin = NVDA_CANDIDATES.map((c) => ({ ...c, quote: quote(1000, 4, 40) }));
    const d = decide(buyInput({ candidates: thin }));
    expect(d.kind).toBe("refuse");
    if (d.kind !== "refuse") return;
    expect(d.reason).toBe("impact_too_high");
    expect(d.candidates).toHaveLength(2);
  });

  it("refuses when no wrapper has a route", () => {
    const d = decide(buyInput({ candidates: NVDA_CANDIDATES.map((c) => ({ ...c, quote: null })) }));
    expect(d.kind === "refuse" && d.reason).toBe("no_route");
  });
});

describe("the premium gate", () => {
  const richQuote = (premiumPct: number, fair: number) => {
    const perShare = fair * (1 + premiumPct / 100);
    const perToken = perShare * 1.005715;
    return [{ ...SPY_CANDIDATES[0]!, quote: quote(1000, 1000 / perToken, 0.01, "Raydium CLMM") }];
  };

  it("queues rather than filling when the market is shut and the token is rich", () => {
    const d = decide(
      buyInput({
        ticker: "SPY",
        candidates: richQuote(1.09, 764.065),
        reference: reference(764.065, 0, 600),
        status: "closed",
        marketOpensAt: new Date("2026-09-21T13:30:00Z"),
      }),
    );
    expect(d.kind).toBe("offer_queue");
    if (d.kind !== "offer_queue") return;
    expect(d.premium.mul(100).toFixed(2)).toBe("1.09");
    // We would buy at fair plus the tolerance, not at the rich price.
    expect(d.suggestedTriggerPricePerShare.toFixed(2)).toBe("771.71");
    expect(d.marketOpensAt).not.toBeNull();
  });

  it("warns but proceeds at the same premium while the market is open", () => {
    const d = decide(
      buyInput({ ticker: "SPY", candidates: richQuote(1.09, 764.065), reference: reference(764.065) }),
    );
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;
    expect(d.warning).toContain("above the real share price");
  });

  it("executes silently inside tolerance", () => {
    const d = decide(
      buyInput({ ticker: "SPY", candidates: richQuote(0.14, 764.065), reference: reference(764.065) }),
    );
    expect(d.kind === "execute" && d.warning).toBeNull();
  });
});

describe("the dividend window", () => {
  // SPY went ex-dividend $1.889 on 18 Sep 2026. Less 30% withholding that is $1.32.
  // Against a $764 share that is 17.3 basis points, and the multiplier had not caught up.
  const netDividend = 1.889 * 0.7;

  it("adds the pending dividend to fair value", () => {
    const ref = reference(764.065, netDividend);
    const fair = fairPricePerShare(ref);
    expect(asBps(fair.div(ref.pricePerShare).sub(1)).toFixed(1)).toBe("17.3");
  });

  it("changes a decision that the naive price would have got wrong", () => {
    // Priced 1.05% above the uncorrected reference, which is 0.88% above the true fair value.
    const perShare = 764.065 * 1.0105;
    const perToken = perShare * 1.005715;
    const candidates = [{ ...SPY_CANDIDATES[0]!, quote: quote(1000, 1000 / perToken, 0.01) }];
    const shared = { ticker: "SPY", candidates, status: "closed" as const };

    const naive = decide(buyInput({ ...shared, reference: reference(764.065) }));
    const corrected = decide(
      buyInput({
        ...shared,
        reference: reference(764.065, netDividend),
        policy: withPolicy({ blockOnCorpActionPending: false }),
      }),
    );

    // The uncorrected price looks rich enough to wait for. The corrected one does not.
    expect(naive.kind).toBe("offer_queue");
    expect(corrected.kind).toBe("execute");

    if (naive.kind === "refuse" || corrected.kind === "refuse") throw new Error("expected decisions");
    expect(asBps(naive.premium.sub(corrected.premium)).toFixed(0)).toBe("17");
  });

  it("blocks trading during the window by default", () => {
    const d = decide(buyInput({ status: "corp_action_pending" }));
    expect(d.kind === "refuse" && d.reason).toBe("corp_action_pending");
  });
});

describe("guards", () => {
  it("refuses a halted instrument even with a perfect quote", () => {
    expect(decide(buyInput({ status: "halted" })).kind).toBe("refuse");
  });

  /*
   * Age widens the band; it does not close the door. A 20-minute-old reference
   * used to refuse, which was stricter than a *fresh* reference saying the
   * route is 3% over fair value — that only warns. It also refused sells,
   * which the premium gate itself says must not happen.
   */
  it("lets an order through on a stale reference while the market is open", () => {
    const d = decide(buyInput({ reference: reference(222.365, 0, 20 * 60) }));
    expect(d.kind).not.toBe("refuse");
  });

  it("refuses only once the reference is too old to price against at all", () => {
    const d = decide(buyInput({ reference: reference(222.365, 0, 2 * 3600) }));
    expect(d.kind === "refuse" && d.reason).toBe("reference_stale");
  });

  /*
   * The case the old bar got catastrophically wrong. The issuer's feed freezes
   * at the closing bell — measured 9 October 2026 — so by Saturday the only
   * reference that exists is Friday's close. Refusing then is refusing to
   * trade on the only price there is.
   */
  it("trades against the last close all weekend, because that is the only price there is", () => {
    const d = decide(buyInput({ reference: reference(222.365, 0, 48 * 3600), status: "closed" }));
    expect(d.kind).not.toBe("refuse");
  });

  it("never refuses a sell for staleness, whatever the hour", () => {
    // "Wait for New York to open" is not a remedy available to someone who
    // needs their own money back at 2am.
    const d = decide(sellInput({ reference: reference(222.365, 0, 60 * 3600), status: "closed" }));
    expect(d.kind).not.toBe("refuse");
  });

  it("widens the premium tolerance with age, and no further than the cap", () => {
    const fresh = staleWidening(100, "open", DEFAULT_POLICY);
    const half = staleWidening(300 + (3_600 - 300) / 2, "open", DEFAULT_POLICY);
    const past = staleWidening(10 * 3_600, "open", DEFAULT_POLICY);
    expect(fresh.toFixed()).toBe("0");
    expect(half.mul(10_000).toFixed(0)).toBe("50");
    // Capped: a band that widens for ever stops being a band.
    expect(past.mul(10_000).toFixed(0)).toBe("100");
  });

  /*
   * Almost flat while the market is shut, by design. Weekend drift was
   * measured under 15 basis points, so two days old is not two days' worth of
   * uncertain — the range there is days, not minutes.
   */
  it("barely widens over a weekend, because a closed market does not drift", () => {
    const w = staleWidening(48 * 3600, "closed", DEFAULT_POLICY);
    expect(w.mul(10_000).toNumber()).toBeLessThan(50);
  });

  /*
   * The longest close the US calendar actually produces, and the reason the bar
   * is four days rather than three: a Monday holiday runs Friday 20:00 UTC to
   * Tuesday 13:30 UTC. Six and a half hours under the bar is thin enough to
   * pin, so a future trim of `deadReferenceAgeSecClosed` fails here rather than
   * on a Presidents' Day.
   */
  it("still trades across a holiday Monday, the longest regular close", () => {
    const d = decide(sellInput({ reference: reference(222.365, 0, 89.5 * 3_600), status: "closed" }));
    expect(d.kind).not.toBe("refuse");
  });

  it("abandons a reference once it is past the four-day bar", () => {
    const d = decide(sellInput({ reference: reference(222.365, 0, 97 * 3_600), status: "closed" }));
    expect(d.kind === "refuse" && d.reason).toBe("reference_stale");
  });

  it("still refuses when it cannot tell whether the market is open", () => {
    const d = decide(buyInput({ status: "stale" }));
    expect(d.kind === "refuse" && d.reason).toBe("reference_stale");
  });

  it("accepts a reference as old as the feed behind it actually gets", () => {
    // Jupiter's stock quote advanced 137s between refreshes when measured on
    // 28 September 2026. A window tighter than that refuses real orders for
    // part of every cycle, which is what 120s did. The guard has to clear the
    // interval of the source it is guarding.
    const d = decide(buyInput({ reference: reference(222.365, 0, 150) }));
    expect(d.kind).not.toBe("refuse");
  });

  it("allows an older reference while the market is shut", () => {
    const d = decide(buyInput({ reference: reference(222.365, 0, 10 * 60), status: "closed" }));
    expect(d.kind).not.toBe("refuse");
  });

  it("refuses below the minimum", () => {
    expect(decide(buyInput({ amount: D(2) })).kind).toBe("refuse");
  });
});

describe("selling", () => {
  it("ranks by proceeds per share, highest first", () => {
    const candidates = [
      { ...SPY_CANDIDATES[0]!, quote: quote(1, 768.5, 0.02) },
      { ...SPY_CANDIDATES[1]!, quote: quote(1, 772.6, 0.05) },
    ];
    const d = decide(
      buyInput({ ticker: "SPY", side: "sell", amount: D(1), candidates, reference: reference(764.065) }),
    );
    expect(d.kind).toBe("execute");
    // 772.6 / 1.009473 = 765.3 a share, against 768.5 / 1.005715 = 764.1
    if (d.kind === "execute") expect(d.best.symbol).toBe("SPYon");
  });

  /*
   * This asserted `offer_queue` until 30 September 2026. The adversity is
   * unchanged — a low price is still adverse when selling — but the answer to
   * it is. Waiting for New York to open is not a remedy available to everyone
   * who needs to sell, so a sell out of tolerance is warned about and allowed.
   */
  it("treats a low price as adverse when selling, and says so rather than stalling", () => {
    const candidates = [{ ...SPY_CANDIDATES[0]!, quote: quote(1, 760.0, 0.02) }];
    const d = decide(
      buyInput({
        ticker: "SPY",
        side: "sell",
        amount: D(1),
        candidates,
        reference: reference(764.065),
        status: "closed",
      }),
    );
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;
    expect(d.warning).toContain("below the real share price");
  });
});

describe("splits", () => {
  it("prices a 10x multiplier the same per share", () => {
    const split = [
      { ...NVDA_CANDIDATES[0]!, multiplier: D(10), quote: quote(1000, 0.449018, 0.02) },
      {
        ...NVDA_CANDIDATES[0]!,
        mint: "other",
        symbol: "NVDAy",
        multiplier: D(1),
        quote: quote(1000, 4.49018, 0.02),
      },
    ];
    const d = decide(buyInput({ candidates: split }));
    if (d.kind !== "execute") throw new Error("expected execute");
    const [a, b] = d.candidates;
    expect(a!.pricePerShare!.toFixed(4)).toBe(b!.pricePerShare!.toFixed(4));
  });
});

describe("multiplierChangesTheAnswer", () => {
  it("is true when raw token prices would pick the wrong wrapper", () => {
    const candidates = [
      { ...SPY_CANDIDATES[0]!, quote: quote(1000, 1.297467, 0.01) },
      { ...SPY_CANDIDATES[1]!, quote: quote(1000, 1.294872, 0.01) },
    ];
    const d = decide(buyInput({ ticker: "SPY", candidates, reference: reference(764.065) }));
    if (d.kind === "refuse") throw new Error("expected a decision");
    expect(multiplierChangesTheAnswer(d.candidates, "buy")).toBe(true);
  });
});

describe("policy", () => {
  it("defaults to a 1% premium tolerance and 1.5% impact ceiling", () => {
    expect(DEFAULT_POLICY.premiumTolerance.eq(fromPct(D(1)))).toBe(true);
    expect(DEFAULT_POLICY.maxPriceImpact.eq(fromPct(D(1.5)))).toBe(true);
  });
});

describe("the bound the user can be held to", () => {
  it("prices the worst case above the expected one for a buy, by the slippage asked for", () => {
    const d = decide(buyInput());
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;

    const worst = d.best.worstPricePerShare!;
    expect(worst.gt(d.best.pricePerShare!)).toBe(true);
    // 50 bps of slippage buys 50 bps fewer tokens, so the share costs 1/0.995
    // more — 50.25 bps, not 50. The bound is the reciprocal, not the discount.
    const gap = worst.div(d.best.pricePerShare!).sub(1);
    expect(asBps(gap).toNumber()).toBeCloseTo(50.25, 1);
  });

  it("prices the worst case below the expected one for a sell, because less comes back", () => {
    const d = decide(
      buyInput({
        side: "sell",
        amount: D(4),
        candidates: [{ ...NVDA_CANDIDATES[0]!, quote: quote(4, 890, 0.02) }],
      }),
    );
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;

    const worst = d.best.worstPricePerShare!;
    expect(worst.lt(d.best.pricePerShare!)).toBe(true);
    expect(asBps(D(1).sub(worst.div(d.best.pricePerShare!))).toNumber()).toBeCloseTo(50, 0);
  });

  it("carries the slippage the prices were quoted with, so nothing spends it silently", () => {
    expect(decide(buyInput()).maxSlippageBps).toBe(DEFAULT_POLICY.slippageBps);
    expect(decide(buyInput({ policy: withPolicy({ slippageBps: 17 }) })).maxSlippageBps).toBe(17);
  });

  it("leaves the bound empty for a candidate that has no route to bound", () => {
    const d = decide(buyInput({ candidates: [{ ...NVDA_CANDIDATES[0]!, quote: null }] }));
    expect(d.candidates[0]!.worstPricePerShare).toBeNull();
    expect(d.candidates[0]!.pricePerShare).toBeNull();
  });
});

describe("filledShares", () => {
  it("is what a buy delivers, corrected by the multiplier", () => {
    const d = decide(buyInput());
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;

    // 4.49018 tokens at a 1.0017 multiplier.
    expect(d.best.filledShares?.toFixed(4)).toBe("4.4978");
  });

  it("is what a sell consumes, not what it delivers", () => {
    const d = decide(sellInput());
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;

    // The sell's input leg is tokens, so filledShares follows inAmount.
    expect(d.best.filledShares?.toFixed(4)).toBe("4.4978");
  });

  it("is null for a candidate with no route, alongside the other nulls", () => {
    const d = decide(buyInput({ candidates: [{ ...NVDA_CANDIDATES[0]!, quote: null }] }));
    expect(d.kind).toBe("refuse");
    const only = d.candidates[0];
    expect(only?.filledShares).toBeNull();
    expect(only?.rejection).toBe("no_route");
  });

  it("survives a candidate refused for impact, because the trade was still priced", () => {
    const d = decide(buyInput());
    const ondo = d.candidates.find((c) => c.symbol === "NVDAon");
    expect(ondo?.viable).toBe(false);
    expect(ondo?.filledShares).not.toBeNull();
  });
});

describe("a sell is refused on different terms from a buy", () => {
  it("lets a position below the minimum be sold, because the trap otherwise fills forever", () => {
    // $5 minimum; 0.01 shares at $222 is about $2.22.
    const d = decide(sellInput({ amount: D("0.01") }));
    expect(d.kind).toBe("execute");
  });

  it("still refuses a buy below the minimum", () => {
    const d = decide(buyInput({ amount: D("2.22") }));
    expect(d.kind).toBe("refuse");
    if (d.kind !== "refuse") return;
    expect(d.reason).toBe("below_minimum");
  });

  it("never offers a sell the wait, even with the market shut and the price adverse", () => {
    // 5% under fair is well outside the 100bp tolerance.
    const cheap = [{ ...NVDA_SELL_CANDIDATES[0]!, quote: quote(4.49018, 950, 0.02) }];
    const d = decide(sellInput({ candidates: cheap, status: "closed" }));
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;
    expect(d.warning).toContain("below the real share price");
    expect(d.warning).toContain("the US market is shut");
  });

  it("still offers a buy the wait on the same facts", () => {
    const dear = [{ ...NVDA_CANDIDATES[0]!, quote: quote(1000, 4.2, 0.02) }];
    const d = decide(buyInput({ candidates: dear, status: "closed" }));
    expect(d.kind).toBe("offer_queue");
  });

  it("warns without the market clause when a sell is adverse during a session", () => {
    const cheap = [{ ...NVDA_SELL_CANDIDATES[0]!, quote: quote(4.49018, 950, 0.02) }];
    const d = decide(sellInput({ candidates: cheap, status: "open" }));
    expect(d.kind).toBe("execute");
    if (d.kind !== "execute") return;
    expect(d.warning).toContain("below the real share price");
    expect(d.warning).not.toContain("shut");
  });
});
