/**
 * Whether the relayer should put its signature on this.
 *
 * The relayer holds a hot key and pays real SOL, so the only thing between
 * that key and an arbitrary message is this function. It is pure on purpose:
 * every judgement is made from values the caller has already resolved, so the
 * rules can be tested exhaustively without a network.
 *
 * Address lookup tables are resolved before this is called. A v0 message can
 * name a program through a lookup table, so an allowlist that only reads the
 * static accounts is an allowlist with a hole in it.
 */

export interface SponsoredTransaction {
  /** The account that pays. Position zero of the message's static accounts. */
  readonly feePayer: string;
  /** Every account the message demands a signature from. */
  readonly signers: readonly string[];
  /** Which of them have signed so far. */
  readonly signedBy: readonly string[];
  /** Every program the message invokes, lookup tables already resolved. */
  readonly programs: readonly string[];
}

export interface SponsorPolicy {
  /** The wallet whose key co-signs and whose SOL is spent. */
  readonly relayer: string;
  readonly allowedPrograms: readonly string[];
}

export type SponsorVerdict =
  { readonly ok: true } | { readonly ok: false; readonly code: SponsorRefusal; readonly message: string };

export type SponsorRefusal =
  "not_sponsored" | "not_your_transaction" | "not_signed" | "extra_signer" | "program_not_allowed";

const refuse = (code: SponsorRefusal, message: string): SponsorVerdict => ({ ok: false, code, message });

/**
 * `wallet` is the caller's own address as Privy signed it, not as the caller
 * claimed it. Everything here is checked against that.
 */
export const validateSponsored = (
  tx: SponsoredTransaction,
  wallet: string,
  policy: SponsorPolicy,
): SponsorVerdict => {
  // Paying for a transaction that does not name us as payer buys nothing and
  // tells us the client built something other than what we offered.
  if (tx.feePayer !== policy.relayer) {
    return refuse("not_sponsored", "This transaction does not name the relayer as its fee payer.");
  }

  if (!tx.signers.includes(wallet)) {
    return refuse("not_your_transaction", "This transaction does not require this account's signature.");
  }

  // The user signs first and we sign last. Arriving unsigned would have us
  // spend SOL on a message the account holder has not agreed to.
  if (!tx.signedBy.includes(wallet)) {
    return refuse("not_signed", "This account has not signed the transaction.");
  }

  /*
   * Only two signatures, ours and theirs.
   *
   * A third required signer is either an authority we do not control — in
   * which case the transaction cannot land and the fee is spent for nothing —
   * or an account being made to authorise something under cover of a swap.
   */
  const extra = tx.signers.find((s) => s !== wallet && s !== policy.relayer);
  if (extra !== undefined) {
    return refuse("extra_signer", `The transaction requires a third signature, from ${extra}.`);
  }

  const forbidden = tx.programs.find((p) => !policy.allowedPrograms.includes(p));
  if (forbidden !== undefined) {
    return refuse("program_not_allowed", `The transaction calls ${forbidden}, which we do not sponsor.`);
  }

  return { ok: true };
};
