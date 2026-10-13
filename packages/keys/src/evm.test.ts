import { describe, expect, it } from "vitest";
import { evmAddressFrom } from "./evm.js";

/*
 * Vectors from two tools that are not this code and not each other:
 *
 *   cast wallet address --private-key <key>          (Foundry)
 *   python3 -c "from eth_keys import keys; ..."      (eth_keys)
 *
 * Both agreed on 13 October 2026. A derivation checked against itself is a
 * derivation that can be confidently wrong, and being wrong here means refunds
 * sent to an address nobody holds.
 */
const VECTORS = [
  {
    key: "0x0000000000000000000000000000000000000000000000000000000000000001",
    address: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  },
  {
    key: "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
    address: "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
  },
] as const;

describe("evmAddressFrom", () => {
  it.each(VECTORS)("derives $address", ({ key, address }) => {
    expect(evmAddressFrom(key)).toBe(address);
  });

  it("accepts a key with no 0x prefix", () => {
    expect(evmAddressFrom(VECTORS[0].key.slice(2))).toBe(VECTORS[0].address);
  });

  it("accepts a key with surrounding whitespace, as an env var carries one", () => {
    expect(evmAddressFrom(`  ${VECTORS[0].key}\n`)).toBe(VECTORS[0].address);
  });

  it("returns a checksummed address, not lower case", () => {
    /* EIP-55. A lower-case address is valid but no tool displays one, and an
       operator comparing ours against Etherscan should see the same string. */
    expect(evmAddressFrom(VECTORS[0].key)).not.toBe(VECTORS[0].address.toLowerCase());
  });

  it("is deterministic", () => {
    expect(evmAddressFrom(VECTORS[1].key)).toBe(evmAddressFrom(VECTORS[1].key));
  });

  it("gives different keys different addresses", () => {
    expect(evmAddressFrom(VECTORS[0].key)).not.toBe(evmAddressFrom(VECTORS[1].key));
  });

  it("refuses a key of the wrong length rather than deriving something", () => {
    expect(() => evmAddressFrom("0xdeadbeef")).toThrow(/32 bytes/i);
  });

  it("refuses a key that is not hex", () => {
    expect(() => evmAddressFrom(`0x${"z".repeat(64)}`)).toThrow(/hex/i);
  });

  it("refuses an empty key without a confusing message", () => {
    expect(() => evmAddressFrom("   ")).toThrow(/empty/i);
  });

  it("never puts the key in the error it throws", () => {
    const key = `0x${"ab".repeat(20)}`; // too short on purpose
    expect(() => evmAddressFrom(key)).toThrow();
    try {
      evmAddressFrom(key);
    } catch (err) {
      expect((err as Error).message).not.toContain("abab");
    }
  });
});
