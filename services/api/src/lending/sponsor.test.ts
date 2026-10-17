import { describe, expect, it } from "vitest";
import type { Address } from "@solana/kit";
import { SYSTEM_PROGRAM, topUp, transferSol } from "./sponsor.js";

const A = (s: string) => s as Address;

/* What mainnet answered for a wallet on 15 October 2026. */
const WALLET_RENT = 650_240n;

describe("topUp", () => {
  it("creates an empty wallet: covers what is spent and leaves it rent exempt", () => {
    expect(topUp(0n, 30_000_000n, WALLET_RENT)).toBe(30_000_000n + WALLET_RENT);
  });

  it("sends only the shortfall to a wallet that has some SOL", () => {
    expect(topUp(10_000_000n, 30_000_000n, WALLET_RENT)).toBe(20_000_000n + WALLET_RENT);
  });

  it("sends nothing to a wallet that can already pay and stay rent exempt", () => {
    expect(topUp(40_000_000n, 30_000_000n, WALLET_RENT)).toBe(0n);
  });

  it("sends nothing when the transaction spends nothing, even to an empty wallet", () => {
    expect(topUp(0n, 0n, WALLET_RENT)).toBe(0n);
    expect(topUp(0n, -5_000n, WALLET_RENT)).toBe(0n);
  });

  /* The minimum is the node's to say. A wallet left at less is one the runtime refuses. */
  it("leaves the wallet holding exactly the minimum it is given", () => {
    expect(topUp(0n, 30_000_000n, 890_880n)).toBe(30_000_000n + 890_880n);
  });
});

describe("transferSol", () => {
  it("is a system transfer: instruction 2, then the lamports little-endian", () => {
    const ix = transferSol(A("relayer"), A("user"), 1_000n);
    expect(ix.programAddress).toBe(SYSTEM_PROGRAM);
    expect(ix.accounts).toEqual([
      { address: "relayer", role: 3 },
      { address: "user", role: 1 },
    ]);
    expect([...ix.data!]).toEqual([2, 0, 0, 0, 0xe8, 0x03, 0, 0, 0, 0, 0, 0]);
  });
});
