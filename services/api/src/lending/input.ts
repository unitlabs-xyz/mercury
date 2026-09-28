import { D, ZERO } from "@mercury/core";
import type { TokenBalance } from "@mercury/chain";
import type { CapacityInput } from "./capacity.js";
import type { LendingSource } from "./ports.js";

/**
 * Everything the capacity maths needs for one wallet.
 *
 * Takes the wallet's balances rather than fetching them, because both callers
 * already have them: `/v1/borrow` reads them to answer, and `/v1/money` reads
 * them for the figure the screen is actually about. Fetching here would make
 * that two RPC calls for one page.
 */
export async function capacityInputFor(
  deps: { readonly lending: LendingSource; readonly usdcMint: string },
  wallet: string,
  balances: readonly TokenBalance[],
): Promise<CapacityInput> {
  const [terms, position] = await Promise.all([deps.lending.terms(), deps.lending.position(wallet)]);

  const usdc = balances.find((b) => b.mint === deps.usdcMint);
  const cashUsd = usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));

  const byMint = new Map<string, bigint>();
  for (const b of balances) byMint.set(b.mint, (byMint.get(b.mint) ?? 0n) + b.rawAmount);

  return { terms, position, wallet: byMint, cashUsd };
}
