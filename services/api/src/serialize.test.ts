import { describe, expect, it } from "vitest";
import { D, decide, DEFAULT_POLICY, type Candidate } from "@mercury/core";
import { decisionToWire } from "./serialize.js";

/*
 * A sell of one wrapper, built inline rather than from core's fixtures: those
 * are not on the package's public surface, and widening it so a test can reach
 * them would be the tail wagging the dog.
 *
 * The multiplier is 2 on purpose. It makes `filledShares` a number that is
 * neither the quote's `inAmount` nor its `outAmount`, so a mapper that passed
 * the wrong one through could not accidentally pass this.
 */
const SELLING: Candidate = {
  mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  symbol: "NVDAx",
  issuer: "backed",
  multiplier: D(2),
  quote: {
    inAmount: D("4.5"),
    outAmount: D(1000),
    minOutAmount: D(995),
    priceImpact: D("0.0002"),
    routeLabels: ["Riptide"],
    quoteId: "q-1",
    expiresAt: new Date("2026-09-19T18:00:30Z"),
    raw: { opaque: true },
  },
};

const NOW = new Date("2026-09-19T18:00:00Z");

const sell = (candidate: Candidate) =>
  decisionToWire(
    decide({
      ticker: "NVDA",
      side: "sell",
      amount: D(9),
      candidates: [candidate],
      /* 9 shares for $1,000 is $111.11 a share, so the quote sits on fair value. */
      reference: {
        pricePerShare: D("111.1111111111"),
        observedAt: new Date(NOW.getTime() - 5_000),
        pendingDividendNet: D(0),
      },
      status: "open",
      policy: DEFAULT_POLICY,
      now: NOW,
    }),
  );

describe("decisionToWire", () => {
  it("carries the shares a candidate trades, which the browser cannot derive", () => {
    const wire = sell(SELLING);
    expect(wire.kind).toBe("execute");
    if (wire.kind !== "execute") return;

    // 4.5 tokens at a multiplier of 2. Neither inAmount nor outAmount.
    expect(wire.best.filledShares).toBe("9");
  });

  it("sends null for a candidate that never got a quote", () => {
    const wire = sell({ ...SELLING, quote: null });
    expect(wire.candidates[0]?.filledShares).toBeNull();
  });
});
