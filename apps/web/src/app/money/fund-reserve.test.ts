import { describe, expect, it } from "vitest";
import { NATIVE_EVM, NATIVE_SOL } from "../../api/fund-swap";

/**
 * The reserve kept back from Max, as FundWalletSwap computes it.
 *
 * Mirrored here rather than exported from the component, because what is worth
 * pinning is the shape of the decision — a token spends whole, a chain's own
 * coin does not — and the numbers it turns on.
 */
const reserveFor = (address: string, chainId: number): bigint =>
  address === NATIVE_SOL
    ? 10_000_000n
    : address === NATIVE_EVM
      ? chainId === 1
        ? 3_000_000_000_000_000n
        : 300_000_000_000_000n
      : 0n;

const BASE = 8453;
const MAINNET = 1;

describe("the gas reserve kept back from Max", () => {
  it("keeps nothing back from an ERC-20, which does not pay its own fee", () => {
    /* Sending USDC does not cost USDC. Reserving any of it would strand a
       balance somebody asked to send in full. */
    expect(reserveFor("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", BASE)).toBe(0n);
  });

  it("keeps nothing back from an SPL token either", () => {
    expect(reserveFor("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 792703809)).toBe(0n);
  });

  it("keeps SOL back, because the fee comes out of the same balance", () => {
    expect(reserveFor(NATIVE_SOL, 792703809)).toBe(10_000_000n);
  });

  it("keeps more back on Ethereum than on a rollup", () => {
    /* An approve and a deposit is roughly 300k gas: about 0.003 ETH at 10 gwei
       on mainnet, a small fraction of that on an L2. One reserve for both
       would either strand money on the rollups or revert on mainnet. */
    expect(reserveFor(NATIVE_EVM, MAINNET)).toBeGreaterThan(reserveFor(NATIVE_EVM, BASE));
  });

  it("reserves an amount that is small in human terms", () => {
    /* 0.003 ETH, not 0.3. A reserve big enough to notice is a bug that reads
       as a rounding error. */
    expect(reserveFor(NATIVE_EVM, MAINNET)).toBeLessThan(10_000_000_000_000_000n);
    expect(reserveFor(NATIVE_SOL, 792703809)).toBeLessThan(100_000_000n);
  });

  it("never reserves more than it leaves, on a balance worth sending", () => {
    /* A wallet with 0.1 ETH should still be able to send most of it. */
    const held = 100_000_000_000_000_000n;
    expect(held - reserveFor(NATIVE_EVM, MAINNET)).toBeGreaterThan((held * 9n) / 10n);
  });
});
