import { describe, expect, it } from "vitest";
import { D, asBps, fromPct } from "../money.js";
import { decide, fairPricePerShare, multiplierChangesTheAnswer } from "./decide.js";
import { DEFAULT_POLICY, withPolicy } from "./policy.js";
import { NVDA_CANDIDATES, SPY_CANDIDATES, buyInput, quote, reference } from "./fixtures.js";

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

  it("refuses a stale reference while the market is open", () => {
    const d = decide(buyInput({ reference: reference(222.365, 0, 20 * 60) }));
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

  it("treats a low price as adverse when selling", () => {
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
    expect(d.kind).toBe("offer_queue");
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
