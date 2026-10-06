import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { axisBounds, DotChart } from "./DotChart";

/**
 * The change axis, and the floor under it.
 *
 * The bug these guard against reached a screenshot: an account worth $14.24
 * moved a third of a cent, the axis fitted itself to that third of a cent, and
 * the chart drew a cliff from $0 to −$0.003 with the y axis labelled in
 * ten-thousandths. Every number on it was correct and the picture was a lie.
 */
describe("axisBounds", () => {
  it("fits the data when the move is big enough to speak for itself", () => {
    // A $12,480 account that moved $547: the floor is $124, the data is wider.
    const { hi, lo } = axisBounds([0, 200, 547], 11_932, true);
    expect(hi).toBeCloseTo(547 + 547 * 0.04, 1);
    expect(lo).toBeCloseTo(-547 * 0.04, 1);
  });

  it("holds the axis open when the move is a rounding error", () => {
    const { hi, lo } = axisBounds([0, -0.0033], 14.24, true);
    // A third of a cent must not fill the chart: 1% of $14.24 is $0.1424.
    expect(hi - lo).toBeGreaterThanOrEqual(14.24 * 0.01);
    // The line sits in the middle third rather than plunging off the bottom.
    const wayDown = (hi - -0.0033) / (hi - lo);
    expect(wayDown).toBeGreaterThan(0.33);
    expect(wayDown).toBeLessThan(0.67);
  });

  it("does not floor a price axis, where the range is the point", () => {
    const { hi, lo } = axisBounds([0, -0.0033], 14.24, false);
    expect(hi - lo).toBeLessThan(0.01);
  });

  it("always keeps $0 on a change axis, so a gain is read against nothing", () => {
    const up = axisBounds([0, 500], 10_000, true);
    expect(up.lo).toBeLessThanOrEqual(0);
    const dn = axisBounds([0, -500], 10_000, true);
    expect(dn.hi).toBeGreaterThanOrEqual(0);
  });

  it("survives an account worth nothing without collapsing the axis", () => {
    const { hi, lo } = axisBounds([0], 0, true);
    expect(hi).toBeGreaterThan(lo);
    expect(Number.isFinite(hi) && Number.isFinite(lo)).toBe(true);
  });

  it("gives a dead-flat line a real axis rather than a zero-height one", () => {
    const { hi, lo } = axisBounds([0, 0, 0], 100, true);
    expect(hi - lo).toBeGreaterThanOrEqual(1);
  });
});

it("labels modeled strategy history as percentages, never dollars", () => {
  const html = renderToStaticMarkup(
    createElement(DotChart, {
      series: [
        { label: "Jan 1", value: 0 },
        { label: "Jan 2", value: 12.5 },
      ],
      label: "past year",
      scale: "percent",
    }),
  );
  expect(html).toContain("Modeled return over past year: from 0% to +12.5%");
  expect(html).not.toContain("$12.50");
});
