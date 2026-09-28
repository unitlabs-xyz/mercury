import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { HistorySource, Series, Span } from "./ports.js";
import { cagrOf, returnsFor } from "./returns.js";

const DAY = 86_400_000;

/** A two-point series spanning `days`, moving from 100 to `end`. */
const spanning = (days: number, end: number): Series => ({
  points: [
    { at: new Date(0), price: D(100) },
    { at: new Date(days * DAY), price: D(end) },
  ],
  changePct: D(end).div(100).sub(1).mul(100),
});

describe("cagrOf", () => {
  it("annualises a five-year move", () => {
    // 100 -> 200 over five years is 2^(1/5) - 1 = 14.87% a year.
    expect(cagrOf(spanning(365.25 * 5, 200))!.toFixed(2)).toBe("14.87");
  });

  it("measures the span from the timestamps, not from the name of the ask", () => {
    // Yahoo's "5y" weekly series is five years and a fortnight. Treating it as a
    // round five would overstate the rate.
    const exact = cagrOf(spanning(365.25 * 5, 200))!;
    const long = cagrOf(spanning(365.25 * 5 + 14, 200))!;
    expect(long.lt(exact)).toBe(true);
  });

  it("returns the plain rate when the span is exactly a year", () => {
    expect(cagrOf(spanning(365.25, 130))!.toFixed(2)).toBe("30.00");
  });

  it("reports a fall as a negative rate", () => {
    expect(cagrOf(spanning(365.25 * 2, 25))!.isNegative()).toBe(true);
  });

  it("refuses to annualise a span too short to mean anything", () => {
    expect(cagrOf(spanning(30, 130))).toBeNull();
  });

  it("returns null rather than dividing by a zero first price", () => {
    const zeroed: Series = {
      points: [
        { at: new Date(0), price: D(0) },
        { at: new Date(365.25 * 5 * DAY), price: D(200) },
      ],
      changePct: D(0),
    };
    expect(cagrOf(zeroed)).toBeNull();
  });

  it("returns null for an empty series", () => {
    expect(cagrOf({ points: [], changePct: D(0) })).toBeNull();
  });
});

describe("returnsFor", () => {
  const sourceOf = (by: Partial<Record<Span, Series | null>>): HistorySource & { asked: Span[] } => {
    const asked: Span[] = [];
    return {
      asked,
      seriesFor: (_t, span) => {
        asked.push(span);
        return Promise.resolve(by[span] ?? null);
      },
    };
  };

  it("reads each figure from the span that measures it", async () => {
    const source = sourceOf({
      "1M": spanning(30, 107),
      "6M": spanning(182, 131),
      "1Y": spanning(365, 126),
      "5Y": spanning(365.25 * 5, 200),
    });
    const r = await returnsFor(source, "NVDA");

    expect(r.m1!.toFixed(0)).toBe("7");
    expect(r.m6!.toFixed(0)).toBe("31");
    expect(r.y1!.toFixed(0)).toBe("26");
    expect(r.cagr5y!.toFixed(2)).toBe("14.87");
    expect(source.asked.sort()).toEqual(["1M", "1Y", "5Y", "6M"]);
  });

  it("leaves a figure null when the provider has no history for it", async () => {
    const r = await returnsFor(sourceOf({ "1M": spanning(30, 107) }), "NVDA");
    expect(r.m1).not.toBeNull();
    expect(r.m6).toBeNull();
    expect(r.y1).toBeNull();
    expect(r.cagr5y).toBeNull();
  });

  it("gives every figure as null for a ticker the provider does not carry", async () => {
    const r = await returnsFor(sourceOf({}), "ZZZ");
    expect([r.m1, r.m6, r.y1, r.cagr5y]).toEqual([null, null, null, null]);
  });
});
