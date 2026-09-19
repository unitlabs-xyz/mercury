import { describe, expect, it } from "vitest";
import { D } from "../money.js";
import { allocate, assertWeightsSum, currentWeights } from "./allocate.js";

const SEMIS = [
  { ticker: "NVDA", weightBps: 3000 },
  { ticker: "AVGO", weightBps: 2200 },
  { ticker: "AMD", weightBps: 1800 },
  { ticker: "TSM", weightBps: 1400 },
  { ticker: "ASML", weightBps: 1000 },
  { ticker: "MU", weightBps: 600 },
];

describe("allocate", () => {
  it("splits by weight", () => {
    const legs = allocate(D(500), SEMIS);
    expect(legs.map((l) => l.usdAmount.toFixed(2))).toEqual(["150.00", "110.00", "90.00", "70.00", "50.00", "30.00"]);
  });

  it("always sums to exactly the input, even when it does not divide", () => {
    for (const amount of ["100.01", "33.33", "7.77", "1234.56", "9.99"]) {
      const legs = allocate(D(amount), SEMIS);
      const sum = legs.reduce((a, l) => a.add(l.usdAmount), D(0));
      expect(sum.toFixed(2)).toBe(D(amount).toFixed(2));
    }
  });

  it("never allocates a fraction of a cent", () => {
    for (const l of allocate(D("33.33"), SEMIS)) {
      expect(l.usdAmount.mul(100).isInteger()).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(allocate(D("77.77"), SEMIS).map((l) => l.usdAmount.toFixed(2))).toEqual(
      allocate(D("77.77"), SEMIS).map((l) => l.usdAmount.toFixed(2)),
    );
  });

  it("handles the locked Core US basket", () => {
    const legs = allocate(D(250), [
      { ticker: "SPY", weightBps: 7000 },
      { ticker: "QQQ", weightBps: 3000 },
    ]);
    expect(legs.map((l) => l.usdAmount.toFixed(2))).toEqual(["175.00", "75.00"]);
  });

  it("rejects weights that do not sum to 100%", () => {
    expect(() => assertWeightsSum([{ ticker: "NVDA", weightBps: 5000 }])).toThrow(RangeError);
  });

  it("rejects a non-positive amount", () => {
    expect(() => allocate(D(0), SEMIS)).toThrow(RangeError);
  });
});

describe("currentWeights", () => {
  it("reports drift against target", () => {
    const w = currentWeights([
      { ticker: "SPY", valueUsd: D(180) },
      { ticker: "QQQ", valueUsd: D(90) },
    ]);
    expect(w.get("SPY")).toBe(6667);
    expect(w.get("QQQ")).toBe(3333);
  });
});
