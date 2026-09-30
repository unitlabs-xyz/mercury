import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";
import type { SponsoredTransaction } from "./validate.js";

/**
 * A wire transaction, as the facts the relayer needs to judge it.
 *
 * Structural refusals live here — what cannot be read. Policy refusals live in
 * `validate`, over values this has already resolved.
 */

export type DecodeRefusal = "not_a_transaction" | "program_from_lookup";

export type DecodeResult =
  | { readonly ok: true; readonly tx: SponsoredTransaction; readonly messageBytes: Uint8Array }
  | { readonly ok: false; readonly code: DecodeRefusal; readonly message: string };

/**
 * Which programs a message invokes, refusing any named through a lookup table.
 *
 * A v0 message can reach a program by index into the accounts a lookup table
 * loads, and reading that table means an RPC round trip and a second parser to
 * get wrong. Both of Jupiter's instructions name their program statically —
 * verified against a live swap on 30 September 2026 — so requiring it costs
 * nothing we use and closes the case where a program is placed out of sight on
 * purpose. A hot key should refuse what it cannot read, not go and look.
 */
export const programsOf = (
  instructions: readonly { readonly programAddressIndex: number }[],
  staticAccounts: readonly string[],
):
  | { readonly ok: true; readonly programs: readonly string[] }
  | { readonly ok: false; readonly at: number } => {
  const programs: string[] = [];
  for (const ix of instructions) {
    const program = staticAccounts[ix.programAddressIndex];
    if (program === undefined) return { ok: false, at: ix.programAddressIndex };
    programs.push(program);
  }
  return { ok: true, programs };
};

export const decodeSponsored = (base64: string): DecodeResult => {
  let message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>;
  let signatures: Record<string, Uint8Array | null>;
  let messageBytes: Uint8Array;
  try {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(base64));
    messageBytes = tx.messageBytes as unknown as Uint8Array;
    message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    signatures = tx.signatures as Record<string, Uint8Array | null>;
  } catch {
    return { ok: false, code: "not_a_transaction", message: "Not a Solana transaction." };
  }

  const statics = message.staticAccounts as readonly string[];
  const found = programsOf(message.instructions, statics);
  if (!found.ok) {
    return {
      ok: false,
      code: "program_from_lookup",
      message: "The transaction names a program through a lookup table, which we will not sign blind.",
    };
  }

  /*
   * The signers are the first `numSignerAccounts` static accounts, and the fee
   * payer is the first of those. That ordering is the message format itself,
   * not a convention.
   */
  const signers = statics.slice(0, message.header.numSignerAccounts);
  const feePayer = signers[0];
  if (feePayer === undefined) {
    return { ok: false, code: "not_a_transaction", message: "The transaction has no fee payer." };
  }

  const signedBy = Object.entries(signatures)
    .filter(([, sig]) => sig !== null)
    .map(([address]) => address);

  return { ok: true, messageBytes, tx: { feePayer, signers, signedBy, programs: found.programs } };
};
