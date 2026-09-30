import { describe, expect, it } from "vitest";
import { borrowedSub, borrowedTone } from "./Summary";
import type { Model } from "./model";

const model = (over: Partial<Model> = {}): Model =>
  ({
    borrowed: 0,
    power: 0,
    available: 0,
    overTarget: 0,
    safeUntilDrop: null,
    health: "healthy",
    debtIsStale: false,
    ...over,
  }) as Model;

/**
 * What the Borrowed figure says underneath itself.
 *
 * This line replaced a refusal. ADR 0009 used to say borrowed money could not
 * buy stock; in a self-custodial wallet that rule stops nobody, so the app
 * shows the consequence instead. The consequence is this number, and it shrinks
 * every time somebody borrows against stock they bought with a loan.
 */
describe("borrowedSub", () => {
  it("offers headroom when nothing is owed", () => {
    expect(borrowedSub(model({ power: 5000, available: 5000 }))).toBe("$5K more available");
  });

  it("says so plainly when there is nothing to borrow against", () => {
    expect(borrowedSub(model())).toBe("Nothing to borrow against");
  });

  it("switches to the cushion once there is a loan, because that is the number at stake", () => {
    const sub = borrowedSub(model({ borrowed: 2500, available: 3000, power: 5500, safeUntilDrop: 0.22 }));
    expect(sub).toBe("Safe unless your shares fall 22%");
  });

  it("shows a thinner cushion as it thins, which is what looping does to it", () => {
    const once = borrowedSub(model({ borrowed: 2500, safeUntilDrop: 0.22 }));
    const twice = borrowedSub(model({ borrowed: 7500, safeUntilDrop: 0.07 }));
    expect(once).toContain("22%");
    expect(twice).toContain("7%");
  });

  it("asks for the repayment instead, once a fall has gone past the limit", () => {
    expect(borrowedSub(model({ borrowed: 9000, health: "over_limit", overTarget: 1200 }))).toBe(
      "Over the limit — repay $1.2K",
    );
    expect(borrowedSub(model({ borrowed: 9000, health: "margin_call", overTarget: 2400 }))).toBe(
      "Repay $2.4K now",
    );
    expect(borrowedSub(model({ borrowed: 9000, health: "liquidation" }))).toBe(
      "Being sold now — repay to stop it",
    );
  });

  it("admits an old figure rather than presenting it as current", () => {
    expect(borrowedSub(model({ borrowed: 2500, safeUntilDrop: 0.22, debtIsStale: true }))).toBe(
      "As of an hour ago — we could not reach Kamino",
    );
  });
});

describe("borrowedTone", () => {
  it("is plain while the loan is inside the limit", () => {
    expect(borrowedTone(model({ borrowed: 2500, safeUntilDrop: 0.22 }))).toBeUndefined();
  });

  it("turns red at every state the owner has to act on", () => {
    for (const health of ["over_limit", "margin_call", "liquidation"] as const) {
      expect(borrowedTone(model({ borrowed: 9000, health }))).toBe("down");
    }
  });
});
