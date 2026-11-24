import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { D, replayPosition, toWire, ZERO, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, disposals, historyJobs, loanEvents, lots, tokens, wallets } from "../db/schema.js";
import { movementsByToken } from "../portfolio/open.js";

/**
 * A liquidation is a sale. Kamino sold the shares to clear the debt, so the
 * money went to the debt rather than the wallet, but the shares were sold all
 * the same, at Kamino's price, and what they fetched less what they had cost
 * is realised P&L, counted with the sells'.
 *
 * Position-sync has already taken the shares out of the records, at average
 * cost, as it does for any shares that leave. This only says what that
 * departure realised: what Kamino took them for, less their average cost
 * just before. The debt it cleared is the loan's, and Kamino's own reading of
 * the debt already shows it gone.
 *
 * Written once per liquidation, when its shares' cost is known: for a linked
 * wallet, once its past has been read and costed, since before then nothing
 * here knows what the shares cost. Until then the row waits, and P&L leaves
 * it out rather than counting the whole sale as profit. Returns the rows
 * written.
 */
export async function settleLiquidations(db: Db, walletId: string): Promise<number> {
  const [wallet] = await db
    .select({ isPrimary: wallets.isPrimary, job: historyJobs.status })
    .from(wallets)
    .leftJoin(historyJobs, eq(historyJobs.walletId, wallets.id))
    .where(eq(wallets.id, walletId))
    .limit(1);
  if (wallet === undefined) return 0;
  // A linked wallet's lots are complete only once its past is costed.
  if (!wallet.isPrimary && wallet.job !== "done") return 0;

  const open = await db
    .select({
      id: loanEvents.id,
      usdAmount: loanEvents.usdAmount,
      tokensRaw: loanEvents.tokensRaw,
      occurredAt: loanEvents.occurredAt,
      tokenId: tokens.id,
    })
    .from(loanEvents)
    // The feed row names the stock's mint; the ledger row names only its ticker.
    .innerJoin(activities, and(eq(activities.refTable, "loan_event"), eq(activities.refId, loanEvents.id)))
    .innerJoin(tokens, eq(tokens.mint, activities.mint))
    .where(
      and(
        eq(loanEvents.walletId, walletId),
        eq(loanEvents.kind, "liquidation"),
        isNull(loanEvents.realisedPnlUsd),
        isNotNull(loanEvents.usdAmount),
        isNotNull(loanEvents.tokensRaw),
      ),
    );

  let written = 0;
  for (const l of open) {
    const seized = BigInt(l.tokensRaw!);
    if (seized <= 0n) continue;
    const held = await heldBefore(db, walletId, l.tokenId, l.occurredAt);
    const realised = liquidationPnl(D(l.usdAmount!), seized, held);
    if (realised === null) continue;
    await db
      .update(loanEvents)
      .set({ realisedPnlUsd: toWire(realised) })
      .where(and(eq(loanEvents.id, l.id), isNull(loanEvents.realisedPnlUsd)));
    written += 1;
  }
  return written;
}

/**
 * What a liquidation realised: what Kamino took the tokens for, less their
 * share of the cost, at average cost, as a sell's realised P&L is (and, like
 * it, before fees, which are counted on their own).
 *
 * Null when more was taken than the records held a cost for: some arrived by
 * a path nobody witnessed, and there is no honest figure, which is the rule
 * a sell follows too.
 */
export const liquidationPnl = (
  proceedsUsd: Decimal,
  seizedRaw: bigint,
  held: { readonly tokenQty: bigint; readonly costUsd: Decimal },
): Decimal | null => {
  if (seizedRaw <= 0n || seizedRaw > held.tokenQty) return null;
  const cost = held.costUsd.mul(D(seizedRaw.toString())).div(D(held.tokenQty.toString()));
  return proceedsUsd.sub(cost);
};

/**
 * The wallet's tokens of one stock just before a moment, and what they cost:
 * every lot acquired and every disposal made before it, replayed at average
 * cost. By when each happened rather than when it was recorded, because a
 * linked wallet's lots are recorded when its past is read, long after.
 */
async function heldBefore(
  db: Db,
  walletId: string,
  tokenId: string,
  at: Date,
): Promise<{ readonly tokenQty: bigint; readonly costUsd: Decimal }> {
  const [lotRows, disposalRows] = await Promise.all([
    db
      .select()
      .from(lots)
      .where(and(eq(lots.walletId, walletId), eq(lots.tokenId, tokenId), lt(lots.acquiredAt, at))),
    db
      .select()
      .from(disposals)
      .where(
        and(eq(disposals.walletId, walletId), eq(disposals.tokenId, tokenId), lt(disposals.occurredAt, at)),
      ),
  ]);
  const moves = movementsByToken(
    lotRows.map((l) => ({
      id: l.id,
      tokenId: l.tokenId,
      tokenQty: l.tokenQty,
      shares: l.shares,
      unitCostUsd: l.unitCostUsd,
      referencePriceUsd: l.referencePriceUsd,
      feeUsd: l.feeUsd,
      acquiredAt: l.acquiredAt,
      recordedAtUs: l.acquiredAt.getTime() * 1000,
      isEstimated: l.isEstimated,
    })),
    disposalRows.map((d) => ({
      id: d.id,
      tokenId: d.tokenId,
      tokenQty: d.tokenQty,
      recordedAtUs: d.occurredAt.getTime() * 1000,
    })),
  ).get(tokenId);
  if (moves === undefined) return { tokenQty: 0n, costUsd: ZERO };
  const open = replayPosition(moves);
  return { tokenQty: open.tokenQty, costUsd: open.costUsd };
}
