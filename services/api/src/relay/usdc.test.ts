import { describe, expect, it } from "vitest";
import type { Address } from "@solana/kit";
import { TOKEN_PROGRAM, associatedTokenAddress, transferInstruction } from "./usdc.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address;

describe("associatedTokenAddress", () => {
  /*
   * Checked against mainnet, not against our own arithmetic. On 30 September
   * 2026 this wallet held 5 USDC, and `getTokenAccountsByOwner` named this
   * account as where it sat. If the derivation drifts, this stops matching a
   * real address rather than stopping matching a number we wrote down.
   */
  it("derives the account mainnet actually holds the balance in", async () => {
    const owner = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address;
    await expect(associatedTokenAddress(owner, USDC)).resolves.toBe(
      "VKV7c5f5RJ5zJd23ukB63fDtv6QNjBys1MvdeNBVWKR",
    );
  });

  it("gives a different account to a different owner", async () => {
    const a = await associatedTokenAddress("8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address, USDC);
    const b = await associatedTokenAddress("AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ" as Address, USDC);
    expect(a).not.toBe(b);
  });

  it("gives a different account to a different mint", async () => {
    const owner = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address;
    const usdc = await associatedTokenAddress(owner, USDC);
    const spcx = await associatedTokenAddress(
      owner,
      "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8" as Address,
    );
    expect(usdc).not.toBe(spcx);
  });
});

describe("transferInstruction", () => {
  const ix = transferInstruction({
    source: "VKV7c5f5RJ5zJd23ukB63fDtv6QNjBys1MvdeNBVWKR" as Address,
    destination: "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ" as Address,
    owner: "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address,
    amount: 250_000n, // $0.25, USDC being six decimals
  });

  it("calls the token program", () => {
    expect(ix.programAddress).toBe(TOKEN_PROGRAM);
  });

  it("tags itself Transfer and carries the amount little-endian", () => {
    expect(ix.data?.[0]).toBe(3);
    expect([...(ix.data ?? []).slice(1)]).toEqual([0x90, 0xd0, 0x03, 0, 0, 0, 0, 0]);
    // 0x0003d090 is 250000.
    expect(0x0003d090).toBe(250_000);
  });

  /* Source and destination writable, the owner a signer. Wrong order moves nothing. */
  it("orders the accounts the token program expects", () => {
    expect(ix.accounts?.map((a) => a.address)).toEqual([
      "VKV7c5f5RJ5zJd23ukB63fDtv6QNjBys1MvdeNBVWKR",
      "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ",
      "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6",
    ]);
    expect(ix.accounts?.map((a) => a.role)).toEqual([1, 1, 3]);
  });

  it("encodes an amount past 32 bits without losing it", () => {
    const big = transferInstruction({
      source: "VKV7c5f5RJ5zJd23ukB63fDtv6QNjBys1MvdeNBVWKR" as Address,
      destination: "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ" as Address,
      owner: "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address,
      amount: 5_000_000_000n,
    });
    const bytes = (big.data ?? []).slice(1);
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i] ?? 0);
    expect(n).toBe(5_000_000_000n);
  });
});
