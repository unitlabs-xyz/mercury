import {
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";

/**
 * The fee payer's signature on a signed wire transaction, base58: the name the
 * node knows it by. Null for anything that isn't a signed transaction.
 */
export const feePayerSignature = (wire: string): string | null => {
  try {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const payer = message.staticAccounts[0];
    if (payer === undefined) return null;
    const sig = tx.signatures[payer as keyof typeof tx.signatures];
    return sig ? getBase58Decoder().decode(sig) : null;
  } catch {
    return null;
  }
};

/** What the node says of a signature, as `getSignatureStatuses` answers; null while it has seen nothing. */
export type SignatureState = {
  readonly err: unknown;
  readonly confirmationStatus?: string | null;
} | null;

/** Where a sent transaction stands once the wait is over. */
export type Landing =
  | { readonly kind: "confirmed" }
  | { readonly kind: "failed"; readonly error: string }
  | { readonly kind: "pending" };

/**
 * Waits for a sent transaction to land: confirmed (or finalized), failed on
 * chain with its error, or still pending when `timeoutMs` runs out, which is
 * not a failure: it may land yet. Asks after `firstMs`, then every `everyMs`.
 */
export async function awaitLanding(
  status: (signature: string) => Promise<SignatureState>,
  signature: string,
  opts: { readonly timeoutMs: number; readonly firstMs?: number; readonly everyMs?: number },
): Promise<Landing> {
  const deadline = Date.now() + opts.timeoutMs;
  let wait = opts.firstMs ?? 1_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, Math.min(wait, Math.max(0, deadline - Date.now()))));
    wait = opts.everyMs ?? 2_000;
    const state = await status(signature);
    if (state?.err) return { kind: "failed", error: JSON.stringify(state.err) };
    if (state?.confirmationStatus === "confirmed" || state?.confirmationStatus === "finalized")
      return { kind: "confirmed" };
    if (Date.now() >= deadline) return { kind: "pending" };
  }
}
