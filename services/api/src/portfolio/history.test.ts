import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { RANGES, bucketSeries, hourOf, type Reading } from "./history.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");

/** `h` hours before NOW, worth `value`. */
const reading = (h: number, value: string): Reading => ({
  at: new Date(NOW.getTime() - h * 3_600_000),
  totalUsd: D(value),
});

describe("hourOf", () => {
  it("floors to the top of the hour, so a restart upserts rather than appends", () => {
    expect(hourOf(new Date("2026-09-30T12:59:59.999Z")).toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(hourOf(new Date("2026-09-30T12:00:00.000Z")).toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
});

describe("bucketSeries", () => {
  it("keeps every hourly reading over a day, because the grid is already hourly", () => {
    const readings = Array.from({ length: 24 }, (_, i) => reading(23 - i, String(100 + i)));
    const out = bucketSeries(readings, "1D", NOW);
    expect(out).toHaveLength(24);
    expect(out[0]?.valueUsd).toBe("100");
    expect(out[23]?.valueUsd).toBe("123");
  });

  it("drops readings older than the range asks for", () => {
    const out = bucketSeries([reading(48, "50"), reading(2, "80"), reading(1, "90")], "1D", NOW);
    expect(out.map((p) => p.valueUsd)).toEqual(["80", "90"]);
  });

  it("closes each bucket on its latest reading, so a week is 3-hourly", () => {
    // Three readings inside one 3h bucket; the last one is the bucket's value.
    const out = bucketSeries([reading(8, "10"), reading(7, "20"), reading(6, "30")], "1W", NOW);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.valueUsd)).toEqual(["20", "30"]);
  });

  it("returns points in time order however the rows arrive", () => {
    const out = bucketSeries([reading(1, "90"), reading(20, "10"), reading(10, "50")], "1D", NOW);
    expect(out.map((p) => p.valueUsd)).toEqual(["10", "50", "90"]);
  });

  it("times each point at the reading it came from, not at the bucket's edge", () => {
    const out = bucketSeries([reading(6, "30")], "1W", NOW);
    expect(out[0]?.at).toBe(reading(6, "30").at.toISOString());
  });

  it("is empty when nothing falls in the range, which is what a new account has", () => {
    expect(bucketSeries([], "1M", NOW)).toEqual([]);
    expect(bucketSeries([reading(24 * 40, "10")], "1M", NOW)).toEqual([]);
  });

  it("carries full precision to the wire rather than rounding to cents", () => {
    const out = bucketSeries([reading(1, "14.254999999999999999")], "1D", NOW);
    expect(out[0]?.valueUsd).toBe("14.254999999999999999");
  });

  it("buckets a month at twelve hours, so a full month draws about sixty points", () => {
    const readings = Array.from({ length: 24 * 30 }, (_, i) => reading(24 * 30 - 1 - i, String(i)));
    const out = bucketSeries(readings, "1M", NOW);
    expect(out.length).toBeGreaterThan(55);
    expect(out.length).toBeLessThanOrEqual(61);
  });
});

describe("RANGES", () => {
  it("spans a day, a week and a month", () => {
    expect(RANGES["1D"].spanHours).toBe(24);
    expect(RANGES["1W"].spanHours).toBe(24 * 7);
    expect(RANGES["1M"].spanHours).toBe(24 * 30);
  });
});
