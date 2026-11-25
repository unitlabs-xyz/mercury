import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import type { OwnedTokenAccount } from "@mercury/chain";

/**
 * The mints an owner holds the ASSOCIATED token account for, empty ones
 * included: the account a move opens (and pays the rent of) when it is missing.
 *
 * Not "any account of the mint". An owner can hold a second, non-associated
 * account for a mint; the move still opens the associated one, so reading the
 * second as "already has one" would quote no rent for an account the linked
 * wallet then pays for (see `holdsAssociated` in `relay/quote.ts`).
 */
export const mintsWithAssociatedAccount = async (
  owner: string,
  accounts: readonly OwnedTokenAccount[],
): Promise<ReadonlySet<string>> => {
  const held = new Set<string>();
  for (const a of accounts) {
    if (held.has(a.mint)) continue;
    const [ata] = await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(a.mint),
      tokenProgram: address(a.programId),
    });
    if (a.address === ata) held.add(a.mint);
  }
  return held;
};
