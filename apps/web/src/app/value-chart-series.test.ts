import { describe, expect, it } from "vitest";
import { drawnSeries } from "./ValueChart";

/**
 * The guard of last resort.
 *
 * Whatever the server gets wrong about flows, a chart headed "Account value"
 * must never draw an account that still holds money as having reached zero.
 */
describe("drawnSeries", () => {
  it("excludes transfers when the values can carry the subtraction", () => {
    const out = drawnSeries([
      { valueUsd: "10", netFlowUsd: "0" },
      { valueUsd: "60", netFlowUsd: "40" },
    ]);
    expect(out).toEqual({ values: [10, 20], excludesTransfers: true });
  });

  /* The production screenshot: $9.71 held, drawn as $10.02 lost. */
  it("draws the values themselves when subtracting transfers would empty the account", () => {
    const out = drawnSeries([
      { valueUsd: "10.02", netFlowUsd: "0" },
      { valueUsd: "9.71", netFlowUsd: "9.72" },
    ]);
    expect(out).toEqual({ values: [10.02, 9.71], excludesTransfers: false });
  });

  it("leaves a genuinely empty account alone, which is not a contradiction", () => {
    const out = drawnSeries([
      { valueUsd: "10", netFlowUsd: "0" },
      { valueUsd: "0", netFlowUsd: "0" },
    ]);
    expect(out).toEqual({ values: [10, 0], excludesTransfers: true });
  });
});
