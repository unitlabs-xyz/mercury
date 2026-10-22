import { D, ZERO, type Decimal } from "@mercury/core";
import type { ChainHistory, TransactionDetail } from "@mercury/chain";
import type { EarnDirectory } from "./directory.js";
import type { EarnLedger } from "./store.js";

/** One move into or out of a vault, as the server built it. */
export interface EarnMove {
  readonly userId: string;
  readonly wallet: string;
  readonly kind: "deposit" | "withdraw";
  readonly vault: string;
}

export type Recorded =
  | { readonly kind: "recorded"; readonly written: boolean; readonly usdc: Decimal }
  /** The node has not returned it yet. Worth asking again. */
  | { readonly kind: "pending" }
  /** Not a move that can be filed as asked. Asking again changes nothing. */
  | {
      readonly kind: "refused";
      readonly code: "validation_failed" | "transaction_failed";
      readonly message: string;
    };

export interface RecordDeps {
  readonly history: ChainHistory;
  readonly ledger: EarnLedger;
  readonly directory: Pick<EarnDirectory, "known">;
  readonly usdcMint: string;
}

/** The wallet's USDC before and after a transaction, as a signed change in dollars. */
export const usdcMoved = (tx: TransactionDetail, wallet: string, mint: string): Decimal => {
  const sum = (entries: TransactionDetail["preTokens"]) =>
    entries
      .filter((e) => e.owner === wallet && e.mint === mint)
      .reduce((s, e) => s.add(D(e.rawAmount.toString()).div(D(10).pow(e.decimals))), ZERO);
  return sum(tx.postTokens).sub(sum(tx.preTokens));
};

const refused = (code: "validation_failed" | "transaction_failed", message: string): Recorded => ({
  kind: "refused",
  code,
  message,
});

/**
 * File what a landed Earn transaction moved, read off the chain rather than
 * taken from anyone: the amount is the change in the wallet's USDC, which for
 * a withdrawal of everything is the only place the figure exists. A deposit
 * also makes its vault the default for the next one.
 *
 * The confirm route and the send path both come here, so a move the app
 * never confirmed is still in the ledger, and confirming one twice writes it
 * once.
 */
export async function recordMove(
  deps: RecordDeps,
  move: EarnMove & { readonly signature: string },
): Promise<Recorded> {
  const tx = await deps.history.transaction(move.signature);
  if (tx === null) return { kind: "pending" };
  if (!tx.accountKeys.includes(move.wallet)) {
    return refused("validation_failed", "That transaction is not this wallet's.");
  }
  if (!tx.succeeded) return refused("transaction_failed", "That transaction failed.");
  // The vault has to be one this transaction touched, so a move cannot be filed under another.
  if (!tx.accountKeys.includes(move.vault) || !(await deps.directory.known(move.vault))) {
    return refused("validation_failed", "That transaction did not use this vault.");
  }

  const moved = usdcMoved(tx, move.wallet, deps.usdcMint);
  // A deposit takes USDC out, a withdrawal brings it back; anything else is not what was asked.
  const usdc = move.kind === "deposit" ? moved.neg() : moved;
  if (usdc.lte(0)) return refused("validation_failed", "That transaction moved no cash.");

  const written = await deps.ledger.record({
    userId: move.userId,
    kind: move.kind,
    usdc,
    vault: move.vault,
    signature: move.signature,
    occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1000),
  });
  if (move.kind === "deposit") await deps.ledger.save(move.userId, { vault: move.vault });
  return { kind: "recorded", written, usdc };
}
