import { and, eq } from "drizzle-orm";
import type { Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { instruments, lots } from "../db/schema.js";
import type { WalletOwner } from "../wallets/active.js";

export type DeclaredCost =
  | { readonly kind: "set"; readonly lots: number }
  | { readonly kind: "unknown_stock" }
  | { readonly kind: "nothing_estimated" };

/**
 * "Set cost": what the person says they paid for a holding, per share, in
 * place of the estimates. It always wins over an estimate, and never replaces
 * an exact figure: a swap Mercury read the dollars of, or a purchase made in
 * Mercury, stays as it was.
 *
 * The holding's estimated lots in this wallet take the figure and become
 * `declared`, exact from now on. The figure is also their reference price,
 * so none of it reads as a premium paid over the quote. Position-sync works
 * the position out again from the lots on its next pass, and the `~` goes.
 *
 * Mercury's records only: nothing moves on the chain, so it is the same for
 * a linked wallet as for the Mercury wallet.
 */
export async function declareCost(
  db: Db,
  owner: WalletOwner,
  ticker: string,
  unitCostUsd: Decimal,
): Promise<DeclaredCost> {
  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.ticker, ticker))
    .limit(1);
  if (instrument === undefined) return { kind: "unknown_stock" };

  const updated = await db
    .update(lots)
    .set({
      unitCostUsd: unitCostUsd.toFixed(),
      referencePriceUsd: unitCostUsd.toFixed(),
      source: "declared",
      isEstimated: false,
      estimateSource: null,
    })
    .where(
      and(
        eq(lots.userId, owner.userId),
        eq(lots.walletId, owner.walletId),
        eq(lots.instrumentId, instrument.id),
        eq(lots.isEstimated, true),
      ),
    )
    .returning({ id: lots.id });
  return updated.length === 0 ? { kind: "nothing_estimated" } : { kind: "set", lots: updated.length };
}
