/**
 * Puts the sponsorship fee of every past trade where it belongs.
 *
 *   pnpm --filter @mercury/api backfill-fees            # report only, writes nothing
 *   pnpm --filter @mercury/api backfill-fees --apply    # write the corrections
 *
 * Every order settled before the fee was separated recorded the wallet's whole
 * USDC delta as the trade, so the charge is inside the price per share on the
 * lot — which is why those positions opened at a loss of exactly the fee. The
 * charge is still on the chain, in the relayer's own leg of the transaction
 * that filled the order, so it can be taken back out exactly rather than
 * estimated.
 *
 * Safe to run twice: it only looks at orders with no fee recorded, so a second
 * pass finds nothing left to do. It writes no position rows — `position-sync`
 * rebuilds those from the lots on its own clock, which is what makes the
 * corrected figures reach the screen.
 *
 * Needs DATABASE_URL and SOLANA_RPC_URL, and no key of any kind. The relayer is
 * read out of each transaction's own fee payer rather than derived from a
 * signing key, so this runs wherever the database can be reached instead of
 * only where the service holds its secret.
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { D } from "@mercury/core";
import { SolanaRpc } from "@mercury/chain";
import type { TransactionDetail } from "@mercury/chain";
import { createDb } from "../src/db/client.js";
import { lots, orders, wallets } from "../src/db/schema.js";
import { readConfig } from "../src/deps.js";
import { planFeeBackfill, type BackfillOrder } from "../src/orders/backfill.js";

const apply = process.argv.includes("--apply");
const config = readConfig();

const db = createDb(config.databaseUrl);
const chain = new SolanaRpc({ rpcUrl: config.solanaRpcUrl });

/*
 * Filled orders that never recorded a fee, with the lot each buy wrote. The
 * join is left: a sell has no lot, and an order whose lot was lost should
 * still get its own fee recorded.
 */
const rows = await db
  .select({
    id: orders.id,
    side: orders.side,
    txSignature: orders.txSignature,
    referencePrice: orders.referencePrice,
    lotId: lots.id,
    lotShares: lots.shares,
    lotUnitCost: lots.unitCostUsd,
    wallet: wallets.address,
  })
  .from(orders)
  .leftJoin(lots, eq(lots.orderId, orders.id))
  // Inner: the trader's address is what separates a sponsored trade's fee from
  // an unsponsored one's cost, so an order we cannot place a wallet against is
  // one we must not guess about.
  .innerJoin(wallets, eq(wallets.userId, orders.userId))
  .where(and(eq(orders.status, "filled"), isNotNull(orders.txSignature), isNull(orders.feeUsd)));

if (rows.length === 0) {
  console.log("nothing to do: every filled order already records a fee");
  process.exit(0);
}
console.log(`${rows.length} filled order${rows.length === 1 ? "" : "s"} with no fee recorded`);

const toBackfill: BackfillOrder[] = rows.map((row) => ({
  id: row.id,
  side: row.side,
  txSignature: row.txSignature!,
  wallet: row.wallet,
  referencePrice: row.referencePrice === null ? null : D(row.referencePrice),
  lot:
    row.lotId === null
      ? null
      : { id: row.lotId, shares: D(row.lotShares!), unitCostUsd: D(row.lotUnitCost!) },
}));

/* One at a time: `batchedRpc` coalesces what it can, and a backfill is not in a hurry. */
const transactions = new Map<string, TransactionDetail>();
for (const [index, order] of toBackfill.entries()) {
  const tx = await chain.transaction(order.txSignature);
  if (tx !== null) transactions.set(order.txSignature, tx);
  if ((index + 1) % 25 === 0) console.log(`  read ${index + 1}/${toBackfill.length} transactions`);
}

const plan = planFeeBackfill(toBackfill, transactions);
const charged = plan.corrections.filter((c) => c.feeUsd.gt(0));
const total = charged.reduce((sum, c) => sum.add(c.feeUsd), D(0));

console.log(
  [
    "",
    `${plan.corrections.length} to correct, ${charged.length} of them charged a fee`,
    `$${total.toFixed(2)} of fees taken back out of recorded share prices`,
    ...plan.skipped.map((s) => `  skipped ${s.orderId}: ${s.reason}`),
  ].join("\n"),
);

if (!apply) {
  console.log("\nnothing written. Pass --apply to write these corrections.");
  process.exit(0);
}

/*
 * One transaction. A half-applied backfill would leave some lots corrected and
 * some not, and no way to tell which from the outside — the fee column is the
 * only marker, and it is written on the same row.
 */
await db.transaction(async (tx) => {
  for (const c of plan.corrections) {
    await tx
      .update(orders)
      .set({ feeUsd: c.feeUsd.toFixed(18) })
      .where(eq(orders.id, c.orderId));
    if (c.lot === undefined) continue;
    await tx
      .update(lots)
      .set({
        unitCostUsd: c.lot.unitCostUsd.toFixed(18),
        feeUsd: c.lot.feeUsd.toFixed(18),
        ...(c.lot.referencePriceUsd === null
          ? {}
          : { referencePriceUsd: c.lot.referencePriceUsd.toFixed(18) }),
      })
      .where(eq(lots.id, c.lot.id));
  }
});

console.log(`\nwrote ${plan.corrections.length} corrections. position-sync will pick them up.`);
process.exit(0);
