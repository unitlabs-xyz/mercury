import { describe, expect, it } from "vitest";
import { bvmAddressFrom } from "./bvm.js";

/*
 * The first vector is BIP173's own published example: hash160
 * 751e76e8199196d454941c45d1b3a323f1433bd6 encodes to
 * bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 — and that hash is of the
 * generator point, so private key 1 must produce exactly that address.
 *
 * The second was derived independently of `@scure/btc-signer`, with `eth_keys`
 * for secp256k1, hashlib for hash160, and a thirty-line bech32 encoder checked
 * against the BIP173 vector above. `bitcoin-cli` is installed on the machine
 * this was written on but has no node to talk to.
 */
const HEX_ONE = "0x0000000000000000000000000000000000000000000000000000000000000001";
const HEX_TWO = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
/** The same key as HEX_TWO, in the form a wallet exports. */
const WIF_TWO = "KymWWYtz6iLgVAzxMYNk3TcVQps2BasrSZFB2T8qVp2jgK7NRof2";
const WIF_TWO_TESTNET = "cQ8VyTtqXn2wecUDjxBsQn7Z34ARr2yYWbPe8sbLzvgjw4CzhJub";

const ADDR_ONE = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const ADDR_TWO = "bc1qnduq8yy8h4nr7g9vuuglzklqatmaquq9ac42k2";

describe("bvmAddressFrom", () => {
  it("derives BIP173's own example address from private key 1", () => {
    expect(bvmAddressFrom(HEX_ONE)).toBe(ADDR_ONE);
  });

  it("derives the independently computed address from the second key", () => {
    expect(bvmAddressFrom(HEX_TWO)).toBe(ADDR_TWO);
  });

  it("reads a mainnet WIF as the same key as its hex", () => {
    /* Operators store these both ways, and the two forms must not disagree —
       an operator who pasted the other one would get a different refund
       address and never know. */
    expect(bvmAddressFrom(WIF_TWO)).toBe(bvmAddressFrom(HEX_TWO));
  });

  it("accepts hex without the 0x prefix", () => {
    expect(bvmAddressFrom(HEX_TWO.slice(2))).toBe(ADDR_TWO);
  });

  it("tolerates surrounding whitespace, as an env var carries one", () => {
    expect(bvmAddressFrom(`  ${WIF_TWO}\n`)).toBe(ADDR_TWO);
  });

  it("derives a mainnet p2wpkh address", () => {
    expect(bvmAddressFrom(HEX_TWO)).toMatch(/^bc1q[02-9ac-hj-np-z]{38}$/);
  });

  it("is case-exact, because Bitcoin addresses are", () => {
    expect(bvmAddressFrom(HEX_TWO)).not.toBe(ADDR_TWO.toUpperCase());
  });

  it("refuses a testnet WIF rather than deriving a confident mainnet address", () => {
    /* The same 32 bytes with a different version byte. Deriving from it would
       produce a plausible address for a key that cannot spend from it — the
       exact silent failure ADR 0015 exists to prevent. */
    expect(() => bvmAddressFrom(WIF_TWO_TESTNET)).toThrow(/mainnet WIF/);
  });

  it("gives different keys different addresses", () => {
    expect(bvmAddressFrom(HEX_ONE)).not.toBe(bvmAddressFrom(HEX_TWO));
  });

  it("refuses an empty key", () => {
    expect(() => bvmAddressFrom("   ")).toThrow(/empty/i);
  });

  it("names the caller's own variable in an error", () => {
    expect(() => bvmAddressFrom("", "TREASURY_KEY_BVM")).toThrow(/TREASURY_KEY_BVM is empty/);
  });

  it("refuses a malformed key without echoing it", () => {
    const nonsense = "Lzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    expect(() => bvmAddressFrom(nonsense)).toThrow();
    try {
      bvmAddressFrom(nonsense);
    } catch (err) {
      expect((err as Error).message).not.toContain("zzz");
    }
  });
});
