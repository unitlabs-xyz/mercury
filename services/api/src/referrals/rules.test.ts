import { describe, expect, it } from "vitest";
import { discountActive, inviterShare, isCode, newCode, pricingFor } from "./rules.js";

const DAY = 86_400_000;
const at = new Date("2026-10-17T12:00:00Z");
const later = (ms: number) => new Date(at.getTime() + ms);

describe("the friend's discount", () => {
  it("takes a quarter off Mercury's rate", () => {
    expect(pricingFor(50, at, at)).toEqual({
      bps: 37.5,
      discount: { pct: 25, until: later(90 * DAY) },
    });
  });

  it("still applies in the last millisecond of day 90", () => {
    expect(discountActive(at, later(90 * DAY - 1))).toBe(true);
  });

  it("stops at 90 days", () => {
    expect(pricingFor(50, at, later(90 * DAY))).toEqual({ bps: 50, discount: null });
  });

  it("leaves someone nobody invited alone", () => {
    expect(pricingFor(50, null, at)).toEqual({ bps: 50, discount: null });
  });

  /* A quarter off nothing is nothing, and "25% off" next to a free trade says something false. */
  it("names no discount when there is no fee to discount", () => {
    expect(pricingFor(0, at, at)).toEqual({ bps: 0, discount: null });
  });
});

describe("the inviter's share", () => {
  it.each([
    [0, "0.25"],
    [9, "0.25"],
    [10, "0.3"],
    [49, "0.3"],
    [50, "0.35"],
  ])("is %s funded friends → %s", (funded, share) => {
    expect(inviterShare(funded, false).toString()).toBe(share);
  });

  it("starts a founding member at 30%", () => {
    expect(inviterShare(0, true).toString()).toBe("0.3");
  });

  it("still lifts a founding member to 35% at 50", () => {
    expect(inviterShare(50, true).toString()).toBe("0.35");
  });
});

describe("codes", () => {
  it("makes eight characters nobody misreads", () => {
    for (let i = 0; i < 50; i++) {
      const code = newCode();
      expect(code).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
      expect(isCode(code)).toBe(true);
    }
  });

  it("accepts a waitlist slug", () => {
    expect(isCode("3kQ9xZ1bTq7w")).toBe(true);
  });

  it.each(["", "abc", "has space", "a".repeat(17), "../etc/pw"])("refuses %j", (code) => {
    expect(isCode(code)).toBe(false);
  });
});
