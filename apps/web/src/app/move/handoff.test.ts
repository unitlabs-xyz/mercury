import { describe, expect, it } from "vitest";
import {
  chosenHandoff,
  handoffSteps,
  nextStep,
  rememberHandoff,
  SHARES_INSTEAD_NOTE,
  USDC_COST_NOTE,
} from "./handoff";

const usdc = { mint: "u", symbol: "USDC", ticker: null, amount: "500", valueUsd: "500" };
const aapl = { mint: "a", symbol: "AAPLx", ticker: "AAPL", amount: "2", valueUsd: "460" };
const tech = { slug: "tech-leaders", name: "Tech Leaders", overlap: "0.75" };

describe("nextStep", () => {
  it("asks for the withdrawal on Glider until something has arrived", () => {
    expect(nextStep({ arrived: null, similar: tech })).toEqual({ kind: "withdraw" });
    expect(nextStep({ arrived: { at: "x", holdings: [] }, similar: tech })).toEqual({ kind: "withdraw" });
  });

  it("asks to move the shares once shares arrived, even with USDC beside them", () => {
    expect(nextStep({ arrived: { at: "x", holdings: [aapl, usdc] }, similar: tech })).toEqual({
      kind: "move-shares",
    });
  });

  it("asks to move the USDC and invest it in the closest Mercury basket once USDC arrived", () => {
    expect(nextStep({ arrived: { at: "x", holdings: [usdc] }, similar: tech })).toEqual({
      kind: "move-usdc",
      invest: { slug: "tech-leaders", name: "Tech Leaders" },
    });
    expect(nextStep({ arrived: { at: "x", holdings: [usdc] }, similar: null })).toEqual({
      kind: "move-usdc",
      invest: null,
    });
  });
});

describe("handoffSteps", () => {
  it("keeps the shares: withdraw to the wallet, take the shares if asked, then move them here", () => {
    expect(handoffSteps("shares", "Phantom", tech)).toEqual([
      "Open Glider and withdraw the basket to Phantom.",
      "If it asks how, choose to receive the shares themselves. Nothing is sold.",
      "Move them to your Mercury wallet here, in one approval.",
    ]);
  });

  it("sells to USDC: withdraw as USDC where offered, move it here, invest it in the closest Mercury basket", () => {
    expect(handoffSteps("usdc", "Phantom", tech)).toEqual([
      "Open Glider and withdraw the basket to Phantom, as USDC if it offers that.",
      "Move the USDC to your Mercury wallet here, in one approval.",
      "Invest it in Tech Leaders, which holds the most of the same, rebalanced for you every day.",
    ]);
    expect(handoffSteps("usdc", "Phantom", null)[2]).toBe(
      "Invest it in a Mercury basket, rebalanced for you every day.",
    );
  });

  it("promises no screen of Glider's: every step that depends on it says if", () => {
    for (const choice of ["shares", "usdc"] as const) {
      const steps = handoffSteps(choice, "Phantom", tech).join(" ");
      expect(steps).toMatch(/if it (asks|offers)/i);
    }
  });

  it("says what selling costs, and what happens if the shares come back instead", () => {
    expect(USDC_COST_NOTE).toMatch(/spreads twice/);
    expect(SHARES_INSTEAD_NOTE).toMatch(/offer to move them here/);
  });
});

describe("the choice, remembered per basket", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("starts on keeping the shares, and remembers a change for that basket only", () => {
    const s = store();
    expect(chosenHandoff("b1", s)).toBe("shares");
    rememberHandoff("b1", "usdc", s);
    expect(chosenHandoff("b1", s)).toBe("usdc");
    expect(chosenHandoff("b2", s)).toBe("shares");
  });

  it("falls back to the shares when the browser keeps nothing", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(chosenHandoff("b1", broken)).toBe("shares");
    expect(() => rememberHandoff("b1", "usdc", broken)).not.toThrow();
    expect(chosenHandoff("b1", null)).toBe("shares");
  });
});
