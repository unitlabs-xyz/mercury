import {
  address as toAddress,
  getBase58Encoder,
  getPublicKeyFromAddress,
  isAddress,
  verifySignature,
  type SignatureBytes,
} from "@solana/kit";

/**
 * Whether `signature` is `address`'s ed25519 signature over `message`.
 *
 * The signature arrives base58, as a wallet's `signMessage` bytes are sent. The
 * message is signed as its UTF-8 bytes, which is what every Solana wallet's
 * `signMessage` signs.
 *
 * False for anything malformed rather than throwing: a bad signature from a
 * client is a refusal to answer, not a server error.
 */
export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  if (!isAddress(address)) return false;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(getBase58Encoder().encode(signature));
  } catch {
    return false;
  }
  if (bytes.length !== 64) return false;
  try {
    const key = await getPublicKeyFromAddress(toAddress(address));
    return await verifySignature(key, bytes as SignatureBytes, new TextEncoder().encode(message));
  } catch {
    // Not every 32 bytes is a point on the curve. Such an address can sign nothing.
    return false;
  }
}
