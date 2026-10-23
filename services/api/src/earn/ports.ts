import type { Decimal } from "@mercury/core";
import type { BuiltTransactions } from "../lending/ports.js";

/** The one vault Mercury puts idle cash in, as it stands right now. */
export interface EarnVault {
  readonly address: string;
  /** The vault's own name, as its curator set it: "Steakhouse USDC". */
  readonly name: string;
  /** What a depositor is paid, after the vault's fees, 0–1. Compounds, so it is an APY. */
  readonly apy: Decimal;
  /** USDC per share right now. Only ever rises, unless a reserve the vault lends to loses money. */
  readonly sharePrice: Decimal;
  /** What the curator takes of the interest, 0–1. */
  readonly performanceFee: Decimal;
  /** What the curator takes of the balance each year, 0–1. */
  readonly managementFee: Decimal;
  /** The least the vault accepts in one deposit, in USDC. */
  readonly minDepositUsdc: Decimal;
}

/** One wallet's shares in the vault, and what they would withdraw as now. */
export interface EarnPosition {
  readonly shares: Decimal;
  readonly usdc: Decimal;
}

export type EarnIntent =
  | { readonly kind: "deposit"; readonly usdc: Decimal }
  /** "all" redeems every share, so nothing is left behind as dust. */
  | { readonly kind: "withdraw"; readonly usdc: Decimal | "all" };

/** Where the vault's USDC is lent right now, by Kamino lending market. */
export interface EarnAllocation {
  readonly market: string;
  readonly usdc: Decimal;
}

export interface EarnSource {
  readonly address: string;
  vault(): Promise<EarnVault>;
  /** Largest first. What is not lent out yet is left out. */
  allocation(): Promise<readonly EarnAllocation[]>;
  position(wallet: string): Promise<EarnPosition | null>;
  /** `sponsor`, when given, pays the fees and any rent the wallet cannot. */
  build(wallet: string, intent: EarnIntent, sponsor?: string): Promise<BuiltTransactions>;
}
