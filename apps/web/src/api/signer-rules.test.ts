import { describe, expect, it } from "vitest";
import { approveIn, continueIn, unchangedMessage, wrongWalletCopy } from "./signer-rules";

const PHANTOM = "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

describe("unchangedMessage", () => {
  it("holds when the wallet signed exactly the bytes it was given", () => {
    expect(unchangedMessage(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it("fails when the wallet added or rewrote anything, which the relayer would refuse", () => {
    expect(unchangedMessage(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(unchangedMessage(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3, 9]))).toBe(false);
  });
});

describe("wrongWalletCopy", () => {
  it("names both wallets by their short addresses, and what to do", () => {
    expect(wrongWalletCopy("Phantom", PHANTOM, OTHER)).toBe(
      "The wallet connected is 9xQe…VFin, not Phantom (7EYn…awMs). Switch your wallet app to 7EYn…awMs and try again.",
    );
  });
});

describe("approveIn and continueIn", () => {
  it("say where the person approves, as the spec words it", () => {
    expect(approveIn("Phantom")).toBe("You'll approve this in Phantom.");
    expect(continueIn("Phantom")).toBe("Continue in Phantom");
  });
});
