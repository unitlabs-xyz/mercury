import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { logger } from "../log/index.js";
import { USDC_MINT } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, fundingIntents, type FundingIntent } from "../db/schema.js";

/**
 * Say where the money came from, on the row `wallet-events` already wrote.
 *
 * Nothing here writes the money-in event. `wallet-events` sees the USDC land
 * on the stream it already walks and writes a `transfer_in` with the amount it
 * read off the chain — that is the fact, and `portfolio/queries.ts:118` reads
 * its `kind` for the performance line's flow sign. This only adds the origin:
 * "Added cash" gets "From Tron · USDT" under it.
 *
 * The shape is `baskets/glider/reconcile.ts`'s, including the `setWhere` guard,
 * so a repeat or a late arrival can never overwrite something better.
 *
 * **Update only, never insert.** The delivered amount is knowable only from
 * the chain, and the quote we minted is indicative. Inserting that figure would
 * put a number nobody verified into a row the performance chart reads as money
 * in. So a fill whose feed row has not arrived yet is left for the next pass —
 * which is what `reconcileFundingDeposits` is.
 */
const log = logger("funding");

export const enrichDepositActivity = async (db: Db, intent: FundingIntent): Promise<boolean> => {
  if (intent.outTxHash === null || intent.status !== "success") return false;

  const subtitle = `From ${intent.originChainName} · ${intent.originCurrencySymbol}`;
  const updated = await db
    .update(activities)
    .set({ subtitle, refTable: "funding_intent", refId: intent.id })
    .where(
      and(
        eq(activities.userId, intent.userId),
        eq(activities.txSignature, intent.outTxHash),
        eq(activities.mint, USDC_MINT),
        /*
         * Only a row that is still the generic one, or one this same intent
         * already named. Anything else has been improved by something with
         * more to say, and a deposit reconciler is not it.
         */
        eq(activities.kind, "transfer_in"),
        sql`(${activities.refTable} is null or (${activities.refTable} = 'funding_intent' and ${activities.refId} = ${intent.id}))`,
      ),
    )
    .returning({ id: activities.id });

  return updated.length === 1;
};

/**
 * Close the gap between the webhook and the wallet-events pass.
 *
 * Relay tells us a deposit succeeded the moment it fills, which is before
 * `wallet-events` has looked — so `enrichDepositActivity` called from the
 * webhook almost always finds no row to name. This runs at the end of the
 * wallet-events pass instead, when the rows exist, exactly as
 * `reconcileBasketExits` already does for basket funding.
 *
 * Bounded to a week, which the `setWhere` guard above makes safe to repeat:
 * every pass re-attempts the same handful of recent deposits for nothing, and
 * a deposit older than that has either been named or never will be.
 */
export const reconcileFundingDeposits = async (db: Db): Promise<number> => {
  const week = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const landed = await db
    .select()
    .from(fundingIntents)
    .where(
      and(
        eq(fundingIntents.status, "success"),
        isNotNull(fundingIntents.outTxHash),
        gt(fundingIntents.updatedAt, week),
      ),
    );

  let named = 0;
  for (const intent of landed) {
    /* One failure is one unnamed row, not a failed pass. The generic row still
       reads true, which is the right way for this to degrade. */
    try {
      if (await enrichDepositActivity(db, intent)) named += 1;
    } catch (error: unknown) {
      log.error({ userId: intent.userId, err: error }, "could not name the deposit");
    }
  }
  return named;
};
