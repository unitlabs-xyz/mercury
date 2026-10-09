import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import { basketBases, basketPnl, basketReturnPct, type BasketMovement } from "./basket-basis.js";

const into = (portfolioId: string, amount: string): BasketMovement => ({
  portfolioId,
  amountUsd: D(amount),
  inward: true,
});
const outOf = (portfolioId: string, amount: string): BasketMovement => ({
  portfolioId,
  amountUsd: D(amount),
  inward: false,
});

const P = "portfolio-7";

describe("basketBases", () => {
  it("adds up what went in", () => {
    const bases = basketBases([into(P, "500"), into(P, "250")]);
    expect(bases.get(P)!.investedUsd.toFixed()).toBe("750");
    expect(bases.get(P)!.isComplete).toBe(true);
  });

  it("takes off what came back, because that money is no longer invested", () => {
    const bases = basketBases([into(P, "500"), outOf(P, "200")]);
    expect(bases.get(P)!.investedUsd.toFixed()).toBe("300");
  });

  it("goes negative once more has been taken out than was put in", () => {
    // Someone who exited at a profit has taken out more than they put in.
    // Clamping at zero would report their remaining stake as pure gain.
    expect(
      basketBases([into(P, "500"), outOf(P, "700")])
        .get(P)!
        .investedUsd.toFixed(),
    ).toBe("-200");
  });

  it("keeps baskets apart", () => {
    const bases = basketBases([into(P, "500"), into("portfolio-8", "100")]);
    expect(bases.get(P)!.investedUsd.toFixed()).toBe("500");
    expect(bases.get("portfolio-8")!.investedUsd.toFixed()).toBe("100");
  });

  it("marks a basis incomplete when something left in kind", () => {
    // Tokens left, not dollars, so no amount was ever recorded for it and the
    // cash taken out is understated by whatever they were worth.
    const bases = basketBases([into(P, "500")], [{ portfolioId: P }]);
    expect(bases.get(P)!.isComplete).toBe(false);
    expect(bases.get(P)!.investedUsd.toFixed()).toBe("500");
  });

  it("leaves another basket's basis complete when only one paid out in kind", () => {
    const bases = basketBases([into(P, "500"), into("portfolio-8", "100")], [{ portfolioId: P }]);
    expect(bases.get("portfolio-8")!.isComplete).toBe(true);
  });

  it("reports a basket that only ever paid out in kind, rather than leaving it out", () => {
    const bases = basketBases([], [{ portfolioId: P }]);
    expect(bases.get(P)).toEqual({ investedUsd: ZERO, isComplete: false });
  });

  it("knows nothing about a basket nothing moved through", () => {
    expect(basketBases([]).get(P)).toBeUndefined();
  });
});

describe("basketPnl", () => {
  it("is what it is worth against what went in", () => {
    const basis = basketBases([into(P, "500")]).get(P)!;
    expect(basketPnl(D("542.10"), basis).toFixed(2)).toBe("42.10");
    expect(basketReturnPct(D("542.10"), basis)!.toFixed(2)).toBe("8.42");
  });

  it("reports a loss as a loss", () => {
    const basis = basketBases([into(P, "500")]).get(P)!;
    expect(basketPnl(D("450"), basis).toFixed()).toBe("-50");
  });

  it("has no percentage when nothing went in, which is not a return of zero", () => {
    const basis = basketBases([into(P, "500"), outOf(P, "500")]).get(P)!;
    expect(basis.investedUsd.toFixed()).toBe("0");
    expect(basketReturnPct(D("12"), basis)).toBeNull();
    // The dollars are still true: $12 left in a basket nothing is staked in.
    expect(basketPnl(D("12"), basis).toFixed()).toBe("12");
  });

  it("has no percentage against a negative stake either", () => {
    const basis = basketBases([into(P, "500"), outOf(P, "700")]).get(P)!;
    expect(basketReturnPct(D("300"), basis)).toBeNull();
  });
});
