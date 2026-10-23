import { describe, expect, it } from "vitest";
import { chargeFromWire, feeLines, rateLabel } from "./fee-lines";

/** The quote's charge, as the ticket reads it. `usdc` is the whole charge. */
describe("chargeFromWire", () => {
  it("reads the parts the server breaks the charge into", () => {
    expect(chargeFromWire({ usdc: "2.51", network: "0.01", mercury: "2.5", mercuryBps: 50 })).toEqual({
      total: 2.51,
      network: 0.01,
      mercury: 2.5,
      mercuryBps: 50,
    });
  });

  it("carries an invited friend's discount through", () => {
    expect(
      chargeFromWire({
        usdc: "1.88",
        network: "0.01",
        mercury: "1.87",
        mercuryBps: 37.5,
        discount: { pct: 25, until: "2027-01-15T12:00:00.000Z" },
      }).discount,
    ).toEqual({ pct: 25, until: "2027-01-15T12:00:00.000Z" });
  });
});

/** The rate as a person reads it: no trailing zeros, and no rounding to a rate we did not charge. */
describe("rateLabel", () => {
  it("writes basis points as a percentage", () => {
    expect(rateLabel(50)).toBe("0.5%");
    expect(rateLabel(35)).toBe("0.35%");
    expect(rateLabel(100)).toBe("1%");
  });

  it("keeps a discounted rate exact", () => {
    expect(rateLabel(37.5)).toBe("0.375%");
    expect(rateLabel(26.25)).toBe("0.2625%");
  });
});

/**
 * The fee lines under the price, one per part of the charge.
 *
 * The deck's confirm screen is the reference: $500 of Nvidia shows Mercury's
 * $2.50 and then the network's $0.01, each as its own line.
 */
describe("feeLines", () => {
  const buy = { selling: false, amount: 500, invested: 497.49 };
  const both = { total: 2.51, network: 0.01, mercury: 2.5, mercuryBps: 50 };

  it("names Mercury's fee with its rate, then the network's", () => {
    const lines = feeLines(both, buy);
    expect(lines.map((l) => [l.label, l.value])).toEqual([
      ["Mercury fee (0.5%)", 2.5],
      ["Network fee", 0.01],
    ]);
  });

  /* A zero line is a line that says nothing: a free trade has no fee to explain. */
  it("leaves out a part that comes to nothing", () => {
    expect(feeLines({ ...both, network: 0, total: 2.5 }, buy).map((l) => l.label)).toEqual([
      "Mercury fee (0.5%)",
    ]);
    expect(feeLines({ ...both, mercury: 0, total: 0.01 }, buy).map((l) => l.label)).toEqual(["Network fee"]);
  });

  it("says a buyer's fee comes out of what they pay", () => {
    expect(feeLines(both, buy)[0]!.tip).toContain("$500.00");
  });

  it("says a seller's fee comes out of the proceeds", () => {
    const lines = feeLines(both, { selling: true, amount: 500, invested: 0 });
    expect(lines.every((l) => l.tip.includes("proceeds"))).toBe(true);
  });

  it("says why an invited friend's rate is lower, and until when", () => {
    const discounted = {
      total: 1.88,
      network: 0.01,
      mercury: 1.87,
      mercuryBps: 37.5,
      discount: { pct: 25, until: "2027-01-15T12:00:00.000Z" },
    };
    const [mercury] = feeLines(discounted, buy);
    expect(mercury?.label).toBe("Mercury fee (0.375%)");
    expect(mercury?.tip).toContain("25% off as an invited friend, until 15 Jan");
  });
});
