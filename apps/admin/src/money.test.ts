import { describe, expect, it } from "vitest";
import { usd as theirs } from "@mercury/view";
import { usd as ours } from "./money";

/**
 * The copy must agree with the product.
 *
 * `money.ts` carries its own `usd` so the bundle does not have to import
 * `@mercury/view` and the chain graph behind it. This is the other half of
 * that decision: a test may import the heavy package, so drift is caught here
 * rather than by somebody noticing the dashboard rounds differently from the
 * page it describes.
 *
 * If this fails, the product's formatting changed. Copy the change across
 * rather than editing the expectation.
 */
const VALUES = [
  "0",
  "0.004", // rounds to $0.00, not $0.01
  "0.005", // the half-way case implementations disagree on
  "1",
  "12480.62",
  "1000000",
  "-12.34",
  "9007199254740993", // beyond a double, so a parse would show
  0,
  12.5,
  null,
  undefined,
  "",
];

describe("usd", () => {
  it.each(VALUES)("formats %s exactly as @mercury/view does", (value) => {
    expect(ours(value)).toBe(theirs(value));
  });

  it("renders nothing as a dash rather than $0.00", () => {
    /* A missing figure and a zero figure are different facts, and a dashboard
       that shows $0.00 for "not loaded" is one that gets believed. */
    expect(ours(null)).toBe("—");
    expect(ours("")).toBe("—");
    expect(ours(0)).toBe("$0.00");
  });
});
