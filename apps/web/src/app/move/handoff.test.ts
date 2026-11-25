import { describe, expect, it } from "vitest";
import { handoffSteps, nextStep } from "./handoff";

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
  it("asks only for the withdrawal to the wallet, and promises the next step from what lands", () => {
    expect(handoffSteps("Phantom")).toEqual([
      "Open the app you put this basket in (Glider, or another app built on it) and withdraw it to Phantom.",
      "When it lands in Phantom, this card offers the next step: move it to your Mercury wallet in one approval.",
    ]);
  });

  it("promises no option of Glider's own app, which can't be checked from here", () => {
    const steps = handoffSteps("Phantom").join(" ");
    expect(steps).not.toMatch(/USDC|shares themselves|in kind|convert/i);
  });
});
