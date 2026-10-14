import { describe, expect, it } from "vitest";
import { funderFrom } from "./funder";

const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

describe("funderFrom", () => {
  it("reads an EVM wallet and keeps the chain id Relay uses", () => {
    expect(funderFrom("eip155:8453:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toEqual({
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      vmType: "evm",
      chainId: 8453,
    });
  });

  it("reads a Solana wallet and renumbers it to Relay's id", () => {
    expect(funderFrom(SOL)).toEqual({
      address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      vmType: "svm",
      chainId: 792703809,
    });
  });

  it("recognises every EVM chain this app declared", () => {
    for (const id of [1, 10, 56, 130, 137, 8453, 42161, 43114]) {
      expect(funderFrom(`eip155:${id}:0xabc`)?.chainId).toBe(id);
    }
  });

  it("refuses an EVM chain the app has not declared", () => {
    /* A chain we cannot switch to cannot be quoted either, and presenting it
       as connected moves the failure somewhere much harder to explain. */
    expect(funderFrom("eip155:324:0xabc")).toBeNull();
  });

  it("refuses a namespace it does not know", () => {
    expect(funderFrom("tron:0x2b6653dc:TR7NHq")).toBeNull();
    expect(funderFrom("bip122:000000000019d6689c085ae165831e93:bc1q")).toBeNull();
  });

  it("is null when nothing is connected", () => {
    expect(funderFrom(undefined)).toBeNull();
  });

  it("refuses a malformed caip address rather than guessing at it", () => {
    expect(funderFrom("")).toBeNull();
    expect(funderFrom("eip155")).toBeNull();
    expect(funderFrom("eip155:8453")).toBeNull();
    expect(funderFrom("eip155:8453:")).toBeNull();
    expect(funderFrom("eip155:not-a-number:0xabc")).toBeNull();
  });
});
