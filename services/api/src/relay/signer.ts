import { parseSolanaSecretKey } from "@mercury/keys/svm";
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
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
 * Re-exported under its original name so this module's callers and tests are
 * untouched by the move.
 *
 * The parser itself now lives in `@mercury/keys/svm`, because
 * `services/treasury` holds a Solana key too and two copies of "which formats
 * does a Solana key arrive in" is how the two drift apart. The label keeps the
 * relayer's own wording in the relayer's own errors.
 */
export const parseSecretKey = (raw: string): Uint8Array => parseSolanaSecretKey(raw, "relayer secret key");

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
