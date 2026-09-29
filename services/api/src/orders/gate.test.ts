import { describe, expect, it } from "vitest";
import { D, decide, DEFAULT_POLICY, withPolicy } from "@mercury/core";
import { buyInput, NVDA_CANDIDATES, quote, reference } from "@mercury/core/testing";
import { gateExecution } from "./gate.js";

const DRIFT = DEFAULT_POLICY.maxQuoteDriftBps;

/** A fresh decision for NVDA at a chosen out-amount, which is what moves the price. */
const freshAt = (outAmount: number, over = {}) =>
  decide(
    buyInput({
      candidates: [{ ...NVDA_CANDIDATES[0]!, quote: quote(1000, outAmount, 0.02) }],
      ...over,
    }),
  );

/** The price per share that decision landed on, as the order row would store it. */
const shownOf = (d: ReturnType<typeof freshAt>): string => {
  if (d.kind === "refuse") throw new Error("fixture should execute");
  return d.best.pricePerShare!.toFixed();
};

describe("gateExecution", () => {
  it("builds when the fresh quote is the same one the user agreed to", () => {
    const fresh = freshAt(4.49018);
    const gate = gateExecution({
      shownPricePerShare: shownOf(fresh),
      fresh,
      maxQuoteDriftBps: DRIFT,
    });
    expect(gate.kind).toBe("build");
  });

  it("stops a buy whose price rose past the drift bar between confirming and signing", () => {
    const shown = shownOf(freshAt(4.49018));
    // Fewer tokens for the same $1,000 is a dearer share: ~100 bps worse.
    const fresh = freshAt(4.44528);
    const gate = gateExecution({ shownPricePerShare: shown, fresh, maxQuoteDriftBps: DRIFT });

    expect(gate.kind).toBe("moved");
    if (gate.kind !== "moved") return;
    expect(Number(gate.adverseBps!.toFixed(0))).toBeGreaterThan(DRIFT);
    expect(gate.detail).toMatch(/moved while you were confirming/);
  });

  it("lets a buy through when the price moved in the user's favour, however far", () => {
    const shown = shownOf(freshAt(4.49018));
    // Many more tokens for the same money: hugely cheaper, and no reason to ask again.
    const fresh = freshAt(5.5);
    expect(gateExecution({ shownPricePerShare: shown, fresh, maxQuoteDriftBps: DRIFT }).kind).toBe("build");
  });

  it("reads drift the other way round for a sell, so cheaper is the adverse direction", () => {
    const sell = (outAmount: number) =>
      decide(
        buyInput({
          side: "sell",
          amount: D(4),
          candidates: [{ ...NVDA_CANDIDATES[0]!, quote: quote(4, outAmount, 0.02) }],
        }),
      );
    const shown = shownOf(sell(890));
    // Fewer dollars for the same four tokens: the seller receives less.
    const gate = gateExecution({
      shownPricePerShare: shown,
      fresh: sell(880),
      maxQuoteDriftBps: DRIFT,
    });
    expect(gate.kind).toBe("moved");

    // And the same move upward is in the seller's favour.
    expect(gateExecution({ shownPricePerShare: shown, fresh: sell(900), maxQuoteDriftBps: DRIFT }).kind).toBe(
      "build",
    );
  });

  it("refuses when the re-priced order no longer passes a guard at all", () => {
    const fresh = decide(
      buyInput({ candidates: NVDA_CANDIDATES, policy: withPolicy({ maxPriceImpact: D(0) }) }),
    );
    const gate = gateExecution({ shownPricePerShare: "222.33", fresh, maxQuoteDriftBps: DRIFT });
    expect(gate.kind).toBe("refuse");
  });

  it("refuses a reference price that went stale while the user was deciding", () => {
    const fresh = freshAt(4.49018, { reference: reference(222.365, 0, 10_000) });
    const gate = gateExecution({ shownPricePerShare: "222.33", fresh, maxQuoteDriftBps: DRIFT });
    expect(gate.kind).toBe("refuse");
    if (gate.kind !== "refuse") return;
    expect(gate.detail).toMatch(/reference price/i);
  });

  it("does not fill an order the market is shut on and the price has run away from", () => {
    const fresh = freshAt(4.2, { status: "closed" as const });
    const gate = gateExecution({ shownPricePerShare: "222.33", fresh, maxQuoteDriftBps: DRIFT });
    expect(gate.kind).toBe("moved");
    if (gate.kind !== "moved") return;
    // No number, because the reason is the rule and not the size of the move.
    expect(gate.adverseBps).toBeNull();
  });

  it("builds when there is no stored price to compare against, rather than blocking", () => {
    const fresh = freshAt(4.49018);
    expect(gateExecution({ shownPricePerShare: null, fresh, maxQuoteDriftBps: DRIFT }).kind).toBe("build");
  });
});
