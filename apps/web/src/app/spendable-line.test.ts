import { describe, expect, it } from "vitest";
import { usd } from "@mercury/view";
import type { Borrow } from "../api/borrow";
import { spendableSub } from "./Money";

/* $8.66 is the borrowing figure this was found on. The cash and spendable
   figures are chosen to agree with it, because agreeing is the point. */
const borrow = (over: Partial<Borrow> = {}): Borrow =>
  ({ cashUsd: 17.36, borrowableUsd: 8.66, spendableUsd: 26.02, ...over }) as Borrow;

/**
 * What the Spendable figure says underneath itself.
 *
 * The figure is cash plus borrowing, so the line beneath it is the sum being
 * shown, not a label for it. That is the whole reason it has to carry cents:
 * at whole dollars the card said $26.02 was "$17.36 plus $9".
 */
describe("spendableSub", () => {
  it("names the borrowing to the cent, as the figure above it is named", () => {
    expect(spendableSub(borrow())).toBe("Cash + $8.66 borrowing");
  });

  it("names exactly what the card's own subtraction leaves", () => {
    /* The invariant that was broken: the line, the Spendable figure and the
       Cash figure are three views of one sum and have to agree. */
    const b = borrow();
    expect(spendableSub(b)).toContain(usd(b.spendableUsd - b.cashUsd));
  });

  it("does not round a credit line upward", () => {
    /* $8.66 shown as "$9" offered a third of a dollar that was not there.
       Of the two directions to be wrong in on borrowing, this was the worse. */
    expect(spendableSub(borrow())).not.toContain("$9");
  });

  it("holds the cents on a figure that would otherwise round down", () => {
    expect(spendableSub(borrow({ borrowableUsd: 8.12 }))).toBe("Cash + $8.12 borrowing");
  });

  it("names the two parts before there is a figure for either", () => {
    expect(spendableSub(undefined)).toBe("Cash and borrowing");
  });

  it("still reads as the same sentence when there is nothing to borrow against", () => {
    expect(spendableSub(borrow({ borrowableUsd: 0 }))).toBe("Cash + $0.00 borrowing");
  });
});
