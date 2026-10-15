import { describe, expect, it } from "vitest";
import { CIRCLE_USDC, depositFeeFor } from "./fees.js";
import { SUPPORTED_CHAIN_IDS } from "./chains.js";

const RECIPIENT = "0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E";
const policy = { bps: 30, recipient: RECIPIENT };

const BASE = 8453;
const BNB = 56;
const ETH_ON_BASE = "0x0000000000000000000000000000000000000000";

describe("depositFeeFor", () => {
  it("charges a token Relay has to swap into USDC", () => {
    expect(depositFeeFor(policy, { chainId: BASE, address: ETH_ON_BASE })).toEqual({
      recipient: RECIPIENT,
      bps: 30,
    });
  });

  /* Relay bridges Circle's USDC for nothing, so charging for it would be charging for our own name on it. */
  it("leaves Circle's own USDC free, on every chain Circle issues it", () => {
    for (const [chainId, address] of Object.entries(CIRCLE_USDC)) {
      expect(depositFeeFor(policy, { chainId: Number(chainId), address })).toBeNull();
    }
  });

  /* Pickers and wallets disagree about checksum case; the address is the same either way. */
  it("recognises Circle's USDC on an EVM chain whatever its letter case", () => {
    const usdc = CIRCLE_USDC[BASE]!;
    expect(depositFeeFor(policy, { chainId: BASE, address: usdc.toLowerCase() })).toBeNull();
  });

  /*
   * Circle issues no USDC on BNB Chain. What is called USDC there is
   * Binance's, bridged, and swapping it costs Relay what any other token does.
   */
  it("charges what is called USDC on a chain Circle does not issue it on", () => {
    expect(
      depositFeeFor(policy, { chainId: BNB, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" }),
    ).not.toBeNull();
  });

  /* An address is only Circle's USDC on the chain Circle put it on. */
  it("does not take Circle's USDC address on one chain as USDC on another", () => {
    expect(depositFeeFor(policy, { chainId: BNB, address: CIRCLE_USDC[BASE]! })).not.toBeNull();
  });

  it("charges nothing when no recipient has been set, because there is nobody to pay", () => {
    expect(depositFeeFor({ bps: 30 }, { chainId: BASE, address: ETH_ON_BASE })).toBeNull();
  });

  it("charges nothing at a rate of zero", () => {
    expect(depositFeeFor({ ...policy, bps: 0 }, { chainId: BASE, address: ETH_ON_BASE })).toBeNull();
  });
});

describe("CIRCLE_USDC", () => {
  /* Checked against developers.circle.com/stablecoins/usdc-contract-addresses on 15 October 2026. */
  it("names Circle's USDC on every chain we take deposits from, except BNB Chain", () => {
    expect(SUPPORTED_CHAIN_IDS.filter((id) => CIRCLE_USDC[id] === undefined)).toEqual([BNB]);
  });
});
