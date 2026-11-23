import { describe, expect, it } from "vitest";
import { arcs, ringPath } from "./donut";

const RING = { cx: 50, cy: 50, inner: 30, outer: 40 };

describe("arcs", () => {
  it("splits the ring by share, in order, from the top", () => {
    expect(arcs([3, 1])).toEqual([
      { start: 0, end: 0.75 },
      { start: 0.75, end: 1 },
    ]);
  });

  it("gives nothing below zero any of the ring", () => {
    expect(arcs([2, -5, 2])).toEqual([
      { start: 0, end: 0.5 },
      { start: 0.5, end: 0.5 },
      { start: 0.5, end: 1 },
    ]);
  });

  it("treats a value that is not a number as nothing", () => {
    expect(arcs([Number.NaN, 4])).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 1 },
    ]);
  });

  it("has no ring when there is nothing to share", () => {
    expect(arcs([])).toEqual([]);
    expect(arcs([0, 0])).toEqual([]);
    expect(arcs([-1])).toEqual([]);
  });

  it("ends exactly at the full ring", () => {
    const out = arcs([1, 1, 1]);
    expect(out.at(-1)?.end).toBeCloseTo(1, 12);
  });
});

describe("ringPath", () => {
  it("draws nothing for an empty piece", () => {
    expect(ringPath({ start: 0.3, end: 0.3 }, RING)).toBe("");
  });

  it("draws a quarter from twelve to three o'clock, outer edge then inner", () => {
    expect(ringPath({ start: 0, end: 0.25 }, RING)).toBe(
      "M 50 10 A 40 40 0 0 1 90 50 L 80 50 A 30 30 0 0 0 50 20 Z",
    );
  });

  it("takes the long way round for a piece over half the ring", () => {
    expect(ringPath({ start: 0, end: 0.75 }, RING)).toContain("A 40 40 0 1 1");
    expect(ringPath({ start: 0, end: 0.75 }, RING)).toContain("A 30 30 0 1 0");
  });

  it("draws a whole ring as two circles, since one arc back to its start draws nothing", () => {
    expect(ringPath({ start: 0, end: 1 }, RING)).toBe(
      "M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10 Z M 50 20 A 30 30 0 1 1 50 80 A 30 30 0 1 1 50 20 Z",
    );
  });
});
