import { D, sharesGainedFromMultiplier, type Decimal } from "@harbor/core";
import type { MultiplierSource } from "@harbor/market";
import type { TokenRegistry } from "@harbor/chain";
import type { Job } from "./index.js";

export interface MultiplierStore {
  lastSeen(mint: string): Promise<Decimal | null>;
  record(mint: string, multiplier: Decimal, at: Date): Promise<void>;
  holdersOf(mint: string): Promise<readonly { userId: string; tokenQty: Decimal }[]>;
  writeDividendLot(userId: string, mint: string, sharesGained: Decimal, at: Date): Promise<void>;
}

/**
 * A dividend arrives as a rise in the token's multiplier. The holder gains shares
 * without spending anything, so we write a lot at zero cost and their average cost per
 * share falls. Most integrations ignore the multiplier entirely and their numbers
 * slowly go wrong. See docs/05.
 */
export function multiplierWatch(
  registry: TokenRegistry,
  multipliers: MultiplierSource,
  store: MultiplierStore,
): Job {
  return {
    name: "multiplier-watch",
    everyMs: 300_000,
    async run() {
      const at = new Date();
      for (const token of await registry.all()) {
        const current = await multipliers.multiplierFor(token.mint);
        if (current === null) continue;

        const previous = await store.lastSeen(token.mint);
        await store.record(token.mint, current, at);
        if (previous === null || current.lte(previous)) continue;

        for (const holder of await store.holdersOf(token.mint)) {
          const gained = sharesGainedFromMultiplier(holder.tokenQty, previous, current);
          if (gained.gt(D(0))) await store.writeDividendLot(holder.userId, token.mint, gained, at);
        }
      }
    },
  };
}
