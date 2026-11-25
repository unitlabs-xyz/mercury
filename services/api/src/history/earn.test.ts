import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "../db/schema.js";
import { rawJson } from "./events.js";
import { planChainEarn, type EarnVault } from "./earn.js";

const ME = "Phantom1111111111111111111111111111111111111";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SHARES = "SteakShares1111111111111111111111111111111";
const VAULTS = new Map<string, EarnVault>([[SHARES, { address: "SteakVault", name: "Steakhouse USDC" }]]);
const AT = new Date("2026-06-01T12:00:00.000Z");
const LINKED = new Date("2026-11-20T00:00:00.000Z");

const event = (over: Partial<HistoryEvent> & { raw?: unknown }): HistoryEvent & { raw: unknown } => ({
  id: "e",
  walletId: "w",
  account: "shares-account",
  signature: "sig",
  blockTime: AT,
  kind: "in",
  mint: SHARES,
  amountRaw: 1_000_000n,
  counterMint: null,
  counterAmountRaw: null,
  sourceOwner: null,
  destinationOwner: null,
  costedAt: null,
  raw: null,
  ...over,
});

/** A withdrawal as the reader kept it: shares left, and `usdc` came back to the wallet. */
const withdrawal = (usdc: bigint) =>
  rawJson({
    signature: "sig",
    blockTime: 1,
    succeeded: true,
    accountKeys: [ME],
    feeLamports: 5000n,
    preLamports: [],
    postLamports: [],
    preTokens: [
      { owner: ME, mint: SHARES, rawAmount: 1_000_000n, decimals: 6 },
      { owner: ME, mint: USDC, rawAmount: 0n, decimals: 6 },
    ],
    postTokens: [
      { owner: ME, mint: SHARES, rawAmount: 0n, decimals: 6 },
      { owner: ME, mint: USDC, rawAmount: usdc, decimals: 6 },
    ],
  });

describe("planChainEarn", () => {
  it("reads shares that arrived for USDC as money put into Earn, at the USDC that left", () => {
    const [move] = planChainEarn(
      [event({ kind: "in", counterMint: USDC, counterAmountRaw: 250_000_000n })],
      VAULTS,
      ME,
      USDC,
      LINKED,
    );
    expect(move).toMatchObject({
      kind: "deposit",
      vault: "SteakVault",
      vaultName: "Steakhouse USDC",
      occurredAt: AT,
    });
    expect(move!.usdc!.toString()).toBe("250");
  });

  it("reads shares that left for USDC as money taken out, at the USDC that came back", () => {
    const [move] = planChainEarn(
      [event({ kind: "out", raw: withdrawal(262_500_000n) })],
      VAULTS,
      ME,
      USDC,
      LINKED,
    );
    expect(move).toMatchObject({ kind: "withdraw", vault: "SteakVault" });
    expect(move!.usdc!.toString()).toBe("262.5");
  });

  it("reads shares moved with no dollars beside them as a transfer, for the cost pass to value", () => {
    const moves = planChainEarn(
      [
        event({ kind: "in", counterMint: null, signature: "In1" }),
        event({ kind: "in", counterMint: "SomeOtherToken", counterAmountRaw: 5n, signature: "In2" }),
        event({ kind: "out", raw: withdrawal(0n), signature: "Out1" }),
      ],
      VAULTS,
      ME,
      USDC,
      LINKED,
    );
    expect(moves.map((m) => [m.signature, m.kind, m.usdc, m.transferShares?.toString()])).toEqual([
      ["In1", "deposit", null, expect.any(String)],
      ["In2", "deposit", null, expect.any(String)],
      ["Out1", "withdraw", null, expect.any(String)],
    ]);
  });

  it("leaves out a departure whose transaction wasn't kept: nothing to read it from", () => {
    expect(planChainEarn([event({ kind: "out", raw: null })], VAULTS, ME, USDC, LINKED)).toEqual([]);
  });

  it("leaves out tokens that are not an Earn vault's shares", () => {
    expect(
      planChainEarn(
        [event({ mint: "StockMint", counterMint: USDC, counterAmountRaw: 5n })],
        VAULTS,
        ME,
        USDC,
        LINKED,
      ),
    ).toEqual([]);
  });

  it("dates a move the node gave no time for at the link", () => {
    const [move] = planChainEarn(
      [event({ blockTime: null, counterMint: USDC, counterAmountRaw: 1_000_000n })],
      VAULTS,
      ME,
      USDC,
      LINKED,
    );
    expect(move!.occurredAt).toEqual(LINKED);
  });
});
