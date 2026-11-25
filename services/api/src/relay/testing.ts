import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { USDC_MINT, type OwnedTokenAccount, type TokenBalance } from "@mercury/chain";

/** Each mint's own token program, as tests read it: USDC is the classic one, the stocks Token-2022. */
export const programOf = (mint: string): string =>
  mint === USDC_MINT
    ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    : "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** The owner's associated account for a mint: the one a sponsored build opens. */
export const associatedAccount = async (owner: string, mint: string): Promise<string> =>
  (
    await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(mint),
      tokenProgram: address(programOf(mint)),
    })
  )[0];

/**
 * An account list in which each balance sits in the owner's associated account
 * for its mint, which is where a wallet normally keeps it: what the fee quote
 * reads to tell whether that account exists (`relay/quote.ts`).
 */
export const heldInAssociated =
  (balances: readonly TokenBalance[] | ((owner: string) => readonly TokenBalance[])) =>
  async (owner: string): Promise<readonly OwnedTokenAccount[]> =>
    Promise.all(
      (typeof balances === "function" ? balances(owner) : balances).map(async (b) => ({
        address: await associatedAccount(owner, b.mint),
        mint: b.mint,
        programId: programOf(b.mint),
        rawAmount: b.rawAmount,
        decimals: b.decimals,
      })),
    );
