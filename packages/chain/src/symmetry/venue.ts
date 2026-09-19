import { D, type Decimal } from "@harbor/core";
import type { BasketQuote, BasketVenue, BasketWeight } from "../ports.js";

/**
 * Symmetry Protocol. See ADR 0005 and docs/10.
 *
 * Deliberately thin. If the day-one spike finds that Symmetry does not support the
 * xStocks mints, only this file and its fixture sibling are replaced.
 *
 * NOT IMPLEMENTED until the spike lands on 20 September. Wire `@symmetry-hq/baskets-sdk`
 * behind these four methods and nothing else changes anywhere in the repository.
 */
export class SymmetryVenue implements BasketVenue {
  constructor(private readonly config: { rpcUrl: string }) {}

  quote(_basketId: string, _usdAmount: Decimal): Promise<BasketQuote> {
    throw new Error("SymmetryVenue.quote: awaiting the spike, see docs/adr/0005-basket-vaults.md");
  }

  invest(_basketId: string, _deposits: readonly { mint: string; amount: Decimal }[], _owner: string): Promise<readonly string[]> {
    throw new Error("SymmetryVenue.invest: awaiting the spike");
  }

  redeem(_basketId: string, _tokens: Decimal, _owner: string): Promise<readonly string[]> {
    throw new Error("SymmetryVenue.redeem: awaiting the spike");
  }

  value(_basketId: string): Promise<{ nav: Decimal; navPerToken: Decimal; weights: readonly BasketWeight[] }> {
    throw new Error("SymmetryVenue.value: awaiting the spike");
  }
}

export const SPIKE_QUESTIONS = [
  "Are the xStocks mints in Symmetry's supported token list? Call getTokenListData().",
  "Do basket tokens route through Jupiter? If so, investing is one swap, not seven.",
  "Can Chainlink be configured as the oracle per constituent?",
] as const;
