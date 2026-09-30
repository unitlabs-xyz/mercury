import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenBalance } from "@mercury/chain";
import { sellableAmounts, type SellableWrapper } from "./sellable.js";

const XSTOCK: SellableWrapper = { mint: "Xsc9", decimals: 8, multiplier: D("1.0017") };
const ONDO: SellableWrapper = { mint: "Ondo", decimals: 6, multiplier: D("1") };

const held = (mint: string, whole: string, decimals: number): TokenBalance => ({
  mint,
  rawAmount: BigInt(D(whole).mul(D(10).pow(decimals)).toFixed(0)),
  decimals,
});

describe("sellableAmounts", () => {
  it("turns shares into each wrapper's own tokens through its own multiplier", () => {
    const out = sellableAmounts([XSTOCK, ONDO], [held("Xsc9", "10", 8), held("Ondo", "10", 6)], D("2"));
    // 2 shares of a 1.0017 wrapper is fewer than 2 tokens.
    expect(out.find((a) => a.mint === "Xsc9")?.tokens.toFixed(6)).toBe("1.996606");
    expect(out.find((a) => a.mint === "Ondo")?.tokens.toFixed(6)).toBe("2.000000");
  });

  it("caps at what the wallet holds, and says it capped", () => {
    const out = sellableAmounts([XSTOCK], [held("Xsc9", "0.5", 8)], D("2"));
    expect(out[0]?.tokens.toFixed(8)).toBe("0.50000000");
    expect(out[0]?.capped).toBe(true);
  });

  it("does not claim to have capped when the ask fits", () => {
    const out = sellableAmounts([XSTOCK], [held("Xsc9", "10", 8)], D("2"));
    expect(out[0]?.capped).toBe(false);
  });

  it("sells the exact balance when shares is null, which is what Sell all means", () => {
    const out = sellableAmounts([XSTOCK], [held("Xsc9", "0.12345678", 8)], null);
    expect(out[0]?.tokens.toFixed(8)).toBe("0.12345678");
    // Nothing was asked for, so nothing was cut short.
    expect(out[0]?.capped).toBe(false);
  });

  it("drops a wrapper the wallet does not hold, because you cannot sell what you lack", () => {
    const out = sellableAmounts([XSTOCK, ONDO], [held("Xsc9", "10", 8)], D("2"));
    expect(out.map((a) => a.mint)).toEqual(["Xsc9"]);
  });

  it("drops a wrapper whose account exists but is empty", () => {
    const out = sellableAmounts([XSTOCK], [{ mint: "Xsc9", rawAmount: 0n, decimals: 8 }], D("2"));
    expect(out).toEqual([]);
  });

  it("rounds the token amount down to the mint's own precision, never up", () => {
    // A third of a share cannot be expressed exactly. Rounding up would ask
    // for more tokens than exist and fail the swap on chain.
    const out = sellableAmounts([ONDO], [held("Ondo", "1", 6)], D("1").div(D(3)));
    expect(out[0]?.tokens.toFixed(6)).toBe("0.333333");
  });
});
