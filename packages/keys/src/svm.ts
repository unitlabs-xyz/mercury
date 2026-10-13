import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Encoder,
} from "@solana/kit";

/**
 * A Solana secret key as people actually store one.
 *
 * `solana-keygen` writes a JSON array of 64 bytes; wallets export the same 64
 * bytes as base58; some tools hand out the 32-byte seed alone. All three are
 * accepted because the alternative is a deploy that fails on a format nobody
 * documented, with a stack trace instead of a sentence.
 *
 * Moved here from `services/api/src/relay/signer.ts`, unchanged except that the
 * label is now a parameter: two callers hold Solana keys for different reasons
 * and each should name its own in the error. The relayer's behaviour is
 * identical, which `signer.test.ts` still proves without edits.
 */
export const parseSolanaSecretKey = (raw: string, label = "Solana secret key"): Uint8Array => {
  const text = raw.trim();
  if (text.length === 0) throw new Error(`The ${label} is empty.`);

  let bytes: Uint8Array;
  if (text.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`The ${label} looks like a JSON array but does not parse.`);
    }
    if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== "number")) {
      throw new Error(`The ${label} must be an array of numbers.`);
    }
    bytes = Uint8Array.from(parsed as number[]);
  } else {
    try {
      bytes = new Uint8Array(getBase58Encoder().encode(text));
    } catch {
      throw new Error(`The ${label} is neither a JSON array nor base58.`);
    }
  }

  if (bytes.length !== 64 && bytes.length !== 32) {
    throw new Error(`The ${label} is ${bytes.length} bytes; expected 64 or 32.`);
  }
  return bytes;
};

/**
 * A Solana address from the key that spends it.
 *
 * Async because ed25519 keys go through WebCrypto here, which is a promise.
 * The 64-byte form carries the public key already and the 32-byte seed does
 * not, which is the whole of the branch.
 */
export const svmAddressFrom = async (raw: string, label?: string): Promise<string> => {
  const bytes = label === undefined ? parseSolanaSecretKey(raw) : parseSolanaSecretKey(raw, label);
  const signer =
    bytes.length === 64
      ? await createKeyPairSignerFromBytes(bytes)
      : await createKeyPairSignerFromPrivateKeyBytes(bytes);
  return signer.address;
};
