import type { ChainReader, TokenBalance } from "@mercury/chain";
import type { LendingSource } from "./ports.js";

/**
 * Stock pledged to Kamino, by mint, in raw units. Pledging moves the tokens out
 * of the wallet into Kamino's reserve, but they are still the user's shares:
 * they come back on withdrawal, and they are what a liquidation would sell.
 * Only stocks count. Cash pledged as collateral is not a holding.
 */
export async function pledgedByMint(
  lending: LendingSource,
  wallet: string,
): Promise<readonly TokenBalance[]> {
  const position = await lending.position(wallet);
  return (position?.deposits ?? [])
    .filter((d) => d.isStock && d.raw > 0n)
    .map((d) => ({ mint: d.mint, rawAmount: d.raw, decimals: d.decimals }));
}

/**
 * The chain as the portfolio should read it: wallet balances plus what is
 * pledged. Without this, pledging would look like selling (the position and
 * its cost basis shrink) and withdrawing would look like a gift at today's
 * price, so the real cost basis would be lost both ways.
 *
 * If Kamino cannot be read this throws rather than falling back to the wallet
 * alone. A reconciliation that does not run leaves the books as they were; one
 * that runs on half the picture rewrites them wrongly.
 */
export function withPledged(chain: ChainReader, lending: LendingSource): ChainReader {
  // Bound once, because forwarding it only where the wrapped reader has it is
  // what stops the wrapper claiming a capability the thing underneath lacks.
  const many = chain.mintConfigs?.bind(chain);
  return {
    mintConfig: (mint) => chain.mintConfig(mint),
    ...(many === undefined ? {} : { mintConfigs: many }),
    tokenBalances: async (owner, commitment) => {
      const [wallet, pledged] = await Promise.all([
        chain.tokenBalances(owner, commitment),
        pledgedByMint(lending, owner),
      ]);
      const merged = new Map<string, TokenBalance>();
      for (const b of [...wallet, ...pledged]) {
        const prev = merged.get(b.mint);
        merged.set(b.mint, prev ? { ...prev, rawAmount: prev.rawAmount + b.rawAmount } : b);
      }
      return [...merged.values()];
    },
  };
}
