import { D, type Decimal } from "@mercury/core";
import type { HistoryEvent } from "../db/schema.js";
import { balanceOf, transactionFromRaw } from "./events.js";

/** An Earn vault, by its share token's mint: what a move into it is filed under. */
export interface EarnVault {
  readonly address: string;
  readonly name: string;
}

/** One Earn move read from a linked wallet's past, ready for the Earn ledger. */
export interface ChainEarnMove {
  readonly kind: "deposit" | "withdraw";
  readonly usdc: Decimal;
  readonly vault: string;
  readonly vaultName: string;
  readonly signature: string;
  readonly occurredAt: Date;
}

const USDC_DECIMALS = 6;

/**
 * A linked wallet's Earn moves, from its vault share tokens' history: shares
 * arriving while USDC left is money put in; shares leaving while USDC came
 * back is money taken out. With these in the ledger, "earned so far" is the
 * shares' value now less what went in net of what came out, exact, as it is
 * for Earn used through Mercury.
 *
 * Only a move that paid in or out in USDC is one: shares sent from or to
 * somebody else carry no dollar figure, and inventing one would be worse than
 * leaving the earned figure without them. A withdrawal's USDC is read from the
 * transaction the reader kept, the dollars the wallet gained in it.
 */
export const planChainEarn = (
  events: readonly (HistoryEvent & { readonly raw: unknown })[],
  vaults: ReadonlyMap<string, EarnVault>,
  wallet: string,
  usdcMint: string,
  fallbackTime: Date,
): readonly ChainEarnMove[] => {
  const moves: ChainEarnMove[] = [];
  for (const e of events) {
    const vault = e.mint === null ? undefined : vaults.get(e.mint);
    if (vault === undefined || e.amountRaw === null || e.amountRaw <= 0n) continue;
    const at = e.blockTime ?? fallbackTime;
    if (e.kind === "in") {
      if (e.counterMint !== usdcMint || e.counterAmountRaw === null || e.counterAmountRaw <= 0n) continue;
      moves.push({
        kind: "deposit",
        usdc: D(e.counterAmountRaw.toString()).div(D(10).pow(USDC_DECIMALS)),
        vault: vault.address,
        vaultName: vault.name,
        signature: e.signature,
        occurredAt: at,
      });
    } else if (e.kind === "out") {
      const tx = transactionFromRaw(e.raw);
      if (tx === null) continue;
      const gained = balanceOf(tx.postTokens, wallet, usdcMint) - balanceOf(tx.preTokens, wallet, usdcMint);
      if (gained <= 0n) continue;
      moves.push({
        kind: "withdraw",
        usdc: D(gained.toString()).div(D(10).pow(USDC_DECIMALS)),
        vault: vault.address,
        vaultName: vault.name,
        signature: e.signature,
        occurredAt: at,
      });
    }
  }
  return moves;
};
