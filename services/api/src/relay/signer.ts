import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Encoder,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
} from "@solana/kit";

/**
 * Whoever pays the SOL.
 *
 * A port rather than a keypair, because where this key lives is not settled.
 * A secret in the environment is the least work and the most exposure; Privy's
 * server SDK is already a dependency here and can hold a wallet whose key we
 * never see. Both satisfy this interface, so that decision does not reach into
 * the routes.
 */
export interface RelaySigner {
  readonly address: string;
  /** Adds the relayer's signature to a transaction the buyer has already signed. */
  cosign(base64: string): Promise<string>;
}

/**
 * A Solana secret key as people actually store one.
 *
 * `solana-keygen` writes a JSON array of 64 bytes; wallets export the same 64
 * bytes as base58; some tools hand out the 32-byte seed alone. All three are
 * accepted because the alternative is a deploy that fails on a format nobody
 * documented, with a stack trace instead of a sentence.
 */
export const parseSecretKey = (raw: string): Uint8Array => {
  const text = raw.trim();
  if (text.length === 0) throw new Error("The relayer secret key is empty.");

  let bytes: Uint8Array;
  if (text.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("The relayer secret key looks like a JSON array but does not parse.");
    }
    if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== "number")) {
      throw new Error("The relayer secret key must be an array of numbers.");
    }
    bytes = Uint8Array.from(parsed as number[]);
  } else {
    try {
      bytes = new Uint8Array(getBase58Encoder().encode(text));
    } catch {
      throw new Error("The relayer secret key is neither a JSON array nor base58.");
    }
  }

  if (bytes.length !== 64 && bytes.length !== 32) {
    throw new Error(`The relayer secret key is ${bytes.length} bytes; expected 64 or 32.`);
  }
  return bytes;
};

export const keypairRelaySigner = async (raw: string): Promise<RelaySigner> => {
  const bytes = parseSecretKey(raw);
  const signer =
    bytes.length === 64
      ? await createKeyPairSignerFromBytes(bytes)
      : await createKeyPairSignerFromPrivateKeyBytes(bytes);

  return {
    address: signer.address,
    async cosign(base64) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(base64));
      // Partial, not full: the buyer's signature is already on this and a full
      // sign would discard it.
      const signed = await partiallySignTransaction([signer.keyPair], tx);
      return getBase64Decoder().decode(getTransactionEncoder().encode(signed));
    },
  };
};
