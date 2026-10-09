import { describe, expect, it } from "vitest";
import { nextWave, waveParts } from "./waves";

const first = new Date("2026-10-10T00:00:00+05:30");
const at = (iso: string) => nextWave(new Date(iso), first).toISOString();

describe("nextWave", () => {
  it("is the first wave until the first wave", () => {
    expect(at("2026-10-09T10:00:00+05:30")).toBe(first.toISOString());
    expect(at("2026-10-09T23:59:59+05:30")).toBe(first.toISOString());
  });

  // The moment it opens, the one being waited for is the one after.
  it("steps to the next door once a wave lands", () => {
    expect(at("2026-10-10T00:00:00+05:30")).toBe(new Date("2026-10-10T06:00:00+05:30").toISOString());
    expect(at("2026-10-10T05:59:59+05:30")).toBe(new Date("2026-10-10T06:00:00+05:30").toISOString());
    expect(at("2026-10-10T06:00:01+05:30")).toBe(new Date("2026-10-10T12:00:00+05:30").toISOString());
  });

  it("keeps the six-hour cadence days later", () => {
    expect(at("2026-10-13T14:30:00+05:30")).toBe(new Date("2026-10-13T18:00:00+05:30").toISOString());
  });
});

describe("waveParts", () => {
  it("splits the remainder into hours, minutes and seconds", () => {
    expect(waveParts(5 * 3600_000 + 7 * 60_000 + 3_000)).toEqual({ hours: 5, minutes: 7, seconds: 3 });
  });

  it("never counts past zero", () => {
    expect(waveParts(-5_000)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});
