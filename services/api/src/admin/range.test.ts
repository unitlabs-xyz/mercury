import { describe, expect, it } from "vitest";
import { MAX_RANGE_DAYS, parseRange } from "./range.js";

describe("parseRange", () => {
  it("defaults to the last thirty days", () => {
    const r = parseRange({});

    expect(r.days).toBe(30);
    expect(r.to.getTime() - r.from.getTime()).toBeCloseTo(30 * 86_400_000, -4);
  });

  it("reads an explicit range", () => {
    const r = parseRange({ from: "2026-09-01", to: "2026-09-08" });

    expect(r.from.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(r.days).toBe(7);
  });

  it("refuses a range longer than the cap", () => {
    /* These are aggregates over tables that live traffic is writing to. An
       unbounded range typed into a URL is how a dashboard takes down the API
       people are trading on. */
    expect(() => parseRange({ from: "2020-01-01", to: "2026-01-01" })).toThrow(/range/i);
  });

  it("refuses a range that runs backwards", () => {
    expect(() => parseRange({ from: "2026-09-08", to: "2026-09-01" })).toThrow();
  });

  it("refuses something that is not a date", () => {
    expect(() => parseRange({ from: "yesterday" })).toThrow();
    expect(() => parseRange({ from: '\'; drop table "order"; --' })).toThrow();
  });

  it("refuses a date that matches the shape but is not a day", () => {
    /* The regex is a shape, not a calendar, and `new Date` rolls over rather
       than failing: "2026-02-30" is 2 March and "2026-02-29" is 1 March,
       because 2026 is not a leap year. Accepted, a range typed as February
       reports March under February's heading. */
    expect(() => parseRange({ from: "2026-02-30" })).toThrow(/not a date/);
    expect(() => parseRange({ from: "2026-02-29" })).toThrow(/not a date/);
    expect(() => parseRange({ from: "2026-13-01" })).toThrow(/not a date/);
    expect(() => parseRange({ from: "2026-01-32" })).toThrow(/not a date/);
    expect(() => parseRange({ to: "2026-04-31" })).toThrow(/not a date/);
  });

  it("still accepts a real leap day", () => {
    /* The round-trip check must not reject 29 February in a year that has
       one — 2028 does. */
    expect(parseRange({ from: "2028-02-29", to: "2028-03-01" }).days).toBe(1);
  });

  it("caps at a round number a person can reason about", () => {
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});
