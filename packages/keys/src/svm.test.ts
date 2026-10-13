import { describe, expect, it } from "vitest";
import { parseSolanaSecretKey, svmAddressFrom } from "./svm.js";

/*
 * Vectors from RFC 8032's own ed25519 test seeds, with the public key derived
 * by Python's `cryptography` (OpenSSL-backed) and base58-encoded by a separate
 * twenty-line script — not by `@solana/kit`, which is the thing under test.
 *
 * `solana-keygen` is not installed on the machine this was written on, so the
 * chain was validated instead against RFC 8032 test vector 1: seed
 * 9d61b19d… must produce public key d75a9801…, and it does.
 */
const VECTORS = [
  {
    seed: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    address: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z",
    base58Sixty4: "49W385L4rePHy6PAaQUovbD2aacgN4HsKXSMeUzRg4fmwXszN91JuMFrQRj3vMDpZuRF3ZknQBuRBoWQJEfXstMw",
  },
  {
    seed: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
    address: "586Z7H2vpX9qNhN2T4e9Utugie3ogjbxzGaMtM3E6HR5",
    base58Sixty4: "2Y4QjyJVZf9tTmTPP1SY9ACpFYTo7brW9iCQ8SunQht5yQ2r1U9KsVv5aMsCGnzj3NR8KG9P3NY7FKBiYbbTJ2no",
  },
] as const;

const jsonSeed = (seedHex: string) => JSON.stringify([...Uint8Array.from(Buffer.from(seedHex, "hex"))]);

describe("svmAddressFrom", () => {
  it.each(VECTORS)("derives $address from a 32-byte seed", async ({ seed, address }) => {
    expect(await svmAddressFrom(jsonSeed(seed))).toBe(address);
  });

  it.each(VECTORS)("derives $address from the base58 64-byte form", async ({ base58Sixty4, address }) => {
    /* The same key in the form a wallet exports. Both must agree, or an
       operator who pasted the other one gets a different refund address. */
    expect(await svmAddressFrom(base58Sixty4)).toBe(address);
  });

  it("is deterministic", async () => {
    const once = await svmAddressFrom(jsonSeed(VECTORS[1].seed));
    expect(await svmAddressFrom(jsonSeed(VECTORS[1].seed))).toBe(once);
  });

  it("gives different keys different addresses", async () => {
    expect(await svmAddressFrom(jsonSeed(VECTORS[0].seed))).not.toBe(
      await svmAddressFrom(jsonSeed(VECTORS[1].seed)),
    );
  });

  it("names the caller's own variable in an error", async () => {
    await expect(svmAddressFrom("", "TREASURY_KEY_SVM")).rejects.toThrow(/TREASURY_KEY_SVM is empty/);
  });
});

/* Moved from services/api/src/relay/signer.test.ts, unchanged in substance. */
describe("parseSolanaSecretKey", () => {
  const sixtyFour = Uint8Array.from({ length: 64 }, (_, i) => i);

  it("reads a solana-keygen JSON array", () => {
    expect(parseSolanaSecretKey(JSON.stringify([...sixtyFour]))).toEqual(sixtyFour);
  });

  it("reads a 32-byte seed", () => {
    const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
    expect(parseSolanaSecretKey(JSON.stringify([...seed]))).toEqual(seed);
  });

  it("tolerates surrounding whitespace, as an env var carries one", () => {
    expect(parseSolanaSecretKey(`  ${JSON.stringify([...sixtyFour])}\n`)).toEqual(sixtyFour);
  });

  it("refuses what it cannot read", () => {
    expect(() => parseSolanaSecretKey("")).toThrow(/empty/);
    expect(() => parseSolanaSecretKey("[1,2,")).toThrow(/does not parse/);
    expect(() => parseSolanaSecretKey('["a","b"]')).toThrow(/array of numbers/);
    expect(() => parseSolanaSecretKey(JSON.stringify([1, 2, 3]))).toThrow(/3 bytes; expected 64 or 32/);
  });
});
