import { generateKeyPair, getAddressFromPublicKey, getBase58Decoder, signBytes } from "@solana/kit";

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
