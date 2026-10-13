import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * An Ethereum address from the key that spends it.
 *
 * The last twenty bytes of the keccak hash of the uncompressed public key,
 * minus its `0x04` tag, checksummed per EIP-55 so an operator comparing this
 * against a block explorer reads the same string.
 *
 * It exists so that no refund address is ever configuration. A configured
 * address can be one we hold no key for and nothing would catch it until a
 * refund landed somewhere unspendable; a derived one cannot disagree with the
 * key that has to spend it. See docs/adr/0015-treasury-service.md.
 */

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    /* Never the input in the message: this function is only ever called on a key. */
    if (Number.isNaN(byte)) throw new Error("The EVM key is not hex.");
    out[i] = byte;
  }
  return out;
};

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** EIP-55: a nibble is upper case when the corresponding hash nibble is 8 or more. */
const checksum = (lower: string): string => {
  const digest = hex(keccak_256(new TextEncoder().encode(lower)));
  return (
    "0x" + [...lower].map((ch, i) => (Number.parseInt(digest[i]!, 16) >= 8 ? ch.toUpperCase() : ch)).join("")
  );
};

export const evmAddressFrom = (raw: string): string => {
  const text = raw.trim().replace(/^0x/i, "");
  if (text.length === 0) throw new Error("The EVM key is empty.");
  if (text.length !== 64) {
    throw new Error(`The EVM key is ${Math.ceil(text.length / 2)} bytes; expected 32 bytes.`);
  }

  /* Uncompressed, then drop the 0x04 tag: keccak is taken over the 64 coordinate bytes. */
  const pub = secp256k1.getPublicKey(hexToBytes(text), false).slice(1);
  return checksum(hex(keccak_256(pub)).slice(-40));
};
