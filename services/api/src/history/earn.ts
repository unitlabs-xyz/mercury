import { D, type Decimal } from "@mercury/core";
import type { HistoryEvent } from "../db/schema.js";
import { balanceOf, transactionFromRaw } from "./events.js";

/** An Earn vault, by its share token's mint: what a move into it is filed under. */
export interface EarnVault {
  readonly address: string;
  readonly name: string;
  /** The share token's decimals: a transfer's shares are counted in them. 6 when not given. */
  readonly sharesDecimals?: number;
}

/** One Earn move read from a linked wallet's past, ready for the Earn ledger. */
export interface ChainEarnMove {
  readonly kind: "deposit" | "withdraw";
  /** Dollars that moved. Null on a share transfer, whose worth the cost pass prices from the day's share price. */
  readonly usdc: Decimal | null;
  /** On a share transfer: the shares that arrived or left, with no USDC beside them. */
  readonly transferShares?: Decimal;
  readonly vault: string;
  readonly vaultName: string;
  readonly signature: string;
  readonly occurredAt: Date;
}

const USDC_DECIMALS = 6;

/**
 * A wallet's Earn moves, from its vault share tokens' history: shares
 * arriving while USDC left is money put in; shares leaving while USDC came
 * back is money taken out. With these in the ledger, "earned so far" is the
 * shares' value now less what went in net of what came out, exact, as it is
 * for Earn used through Mercury.
 *
 * Shares that arrive or leave with no USDC beside them (sent from or to
 * another wallet, the person's own or anyone's) are money in or out all the
 * same, at what they were worth then. Left out, shares received counted
 * whole as earned, and shares sent took what they had earned with them. Their
 * worth is the vault's share price that day, which the cost pass looks up:
 * planned here with no dollars, as a transfer of so many shares.
 *
 * A withdrawal's USDC is read from the transaction the reader kept, the
 * dollars the wallet gained in it.
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
    const shares = D(e.amountRaw.toString()).div(D(10).pow(vault.sharesDecimals ?? USDC_DECIMALS));
    if (e.kind === "in") {
      if (e.counterMint !== usdcMint || e.counterAmountRaw === null || e.counterAmountRaw <= 0n) {
        moves.push({
          kind: "deposit",
          usdc: null,
          transferShares: shares,
          vault: vault.address,
          vaultName: vault.name,
          signature: e.signature,
          occurredAt: at,
        });
        continue;
      }
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
      if (gained <= 0n) {
        moves.push({
          kind: "withdraw",
          usdc: null,
          transferShares: shares,
          vault: vault.address,
          vaultName: vault.name,
          signature: e.signature,
          occurredAt: at,
        });
        continue;
      }
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
