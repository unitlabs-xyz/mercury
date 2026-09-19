import { describe, expect, it } from "vitest";
import { FixtureMultiplierSource, FixtureReferenceSource, FixtureSessionSource } from "./fixture.js";

describe("fixture market", () => {
  it("reports the measured Saturday as shut, with Monday's open", async () => {
    const s = await new FixtureSessionSource().current();
    expect(s.status).toBe("closed");
    expect(s.isWeekend).toBe(true);
    expect(s.nextOpenAt?.getUTCDay()).toBe(1);
  });

  it("has no pending dividend by default", async () => {
    const r = await new FixtureReferenceSource().priceFor("SPY");
    expect(r?.pendingDividendNet.isZero()).toBe(true);
  });

  it("carries the SPY dividend window when asked", async () => {
    const r = await new FixtureReferenceSource({ SPY: "1.3223" }).priceFor("SPY");
    // 1.889 gross less 30% withholding, against a $764 share, is 17.3 basis points.
    expect(r!.pendingDividendNet.div(r!.pricePerShare).mul(10_000).toFixed(1)).toBe("17.3");
  });

  it("reads a multiplier for a known mint", async () => {
    const m = await new FixtureMultiplierSource().multiplierFor("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
    expect(m?.toFixed(6)).toBe("1.005715");
  });
});
