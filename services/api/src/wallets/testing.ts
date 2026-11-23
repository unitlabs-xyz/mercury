import { generateKeyPair, getAddressFromPublicKey, getBase58Decoder, signBytes } from "@solana/kit";
import type { ActingWallet } from "./acting.js";

/**
 * A real Solana keypair standing in for someone's Phantom, for tests.
 *
 * Real rather than faked, so linking is tested against ed25519 itself: a fake
 * verifier would assert our own belief about signatures back to us.
 */
export async function testWallet(): Promise<{ address: string; sign: (message: string) => Promise<string> }> {
  const keys = await generateKeyPair();
  const address = await getAddressFromPublicKey(keys.publicKey);
  return {
    address,
    sign: async (message) =>
      getBase58Decoder().decode(await signBytes(keys.privateKey, new TextEncoder().encode(message))),
  };
}

/**
 * A wallet as `actingWallet` leaves it on the context, for a route test that
 * stands in for the middleware. The Mercury wallet unless told otherwise.
 */
export const actingAs = (address: string, over: Partial<ActingWallet> = {}): ActingWallet => ({
  id: `wallet-id-${address}`,
  address,
  kind: "privy_embedded",
  isPrimary: true,
  label: null,
  ...over,
});

/** A linked wallet as `actingWallet` leaves it. */
export const actingLinked = (address: string, over: Partial<ActingWallet> = {}): ActingWallet =>
  actingAs(address, { kind: "external", isPrimary: false, ...over });
