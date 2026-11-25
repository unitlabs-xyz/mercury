import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { basketAccounts, historyTxs, wallets, type HistoryEvent } from "../db/schema.js";
import { followed } from "../wallets/active.js";
import { KAMINO_LENDING_PROGRAM, transactionFromRaw } from "./events.js";
import { movementsIn, type Movement as CashMovement } from "../wallet-events/movements.js";
import { USDC_MINT } from "@mercury/chain";

/** How long before a move landed position-sync may have written its departure: clocks are not exact. */
export const SEEN_EARLY_MS = 2 * 60_000;

/** The person's Mercury wallet, unless it is the one being costed. */
export async function mercuryWalletOf(
  db: Db,
  userId: string,
  walletId: string,
): Promise<{ readonly id: string; readonly address: string } | null> {
  const [row] = await db
    .select({ id: wallets.id, address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isPrimary, true), ne(wallets.id, walletId)))
    .limit(1);
  return row ?? null;
}

/** The person's other wallets, by address: a transfer from one is a move, and keeps the cost it had. */
export async function ownWallets(
  db: Db,
  userId: string,
  walletId: string,
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .select({ id: wallets.id, address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), ne(wallets.id, walletId)));
  return new Map(rows.map((r) => [r.address, r.id]));
}

/**
 * Cash that moved while the wallet was unlinked, read when it is linked again.
 *
 * The live activity job starts again from the moment of the new link (see
 * `linkWallet`), so nothing in the feed says what the wallet's dollars did in
 * the gap. The reader read them, from the USDC account's history: here they
 * are worded as the live job words them (`movementsIn`: cash added or sent, a
 * move between the person's own wallets, money into or out of a basket; a
 * trade or a loan is no cash row) and marked found in history. Written by the
 * cost pass in its transaction, never told as news.
 *
 * Only a later costing's, and only from before the wallet's current link: a
 * first costing's past is the wallet's history from before Mercury followed
 * it, which is never in the feed, and anything since the link the live job
 * has written already.
 */
export async function gapCash(
  db: Db,
  wallet: { readonly userId: string; readonly address: string },
  pending: readonly HistoryEvent[],
  linkedAt: Date,
  now: Date,
): Promise<readonly CashMovement[]> {
  const signatures = [
    ...new Set(
      pending
        .filter(
          (e) =>
            e.mint === USDC_MINT &&
            (e.kind === "in" || e.kind === "out") &&
            e.blockTime !== null &&
            e.blockTime.getTime() < linkedAt.getTime(),
        )
        .map((e) => e.signature),
    ),
  ];
  if (signatures.length === 0) return [];
  const [raws, mine, baskets] = await Promise.all([
    db.select({ raw: historyTxs.raw }).from(historyTxs).where(inArray(historyTxs.signature, signatures)),
    db
      .select({ address: wallets.address, label: wallets.label, isPrimary: wallets.isPrimary })
      .from(wallets)
      .where(and(eq(wallets.userId, wallet.userId), followed)),
    db
      .select({ address: basketAccounts.address, portfolioId: basketAccounts.portfolioId })
      .from(basketAccounts)
      .where(eq(basketAccounts.userId, wallet.userId)),
  ]);
  const self = mine.find((w) => w.address === wallet.address);
  const ownWallets = new Map(mine.filter((w) => w.address !== wallet.address).map((w) => [w.address, w]));
  const basketAccountsByAddress = new Map(baskets.map((b) => [b.address, b.portfolioId]));
  return raws.flatMap(({ raw }) => {
    const tx = transactionFromRaw(raw);
    if (tx === null) return [];
    return movementsIn(tx, {
      wallet: wallet.address,
      now,
      lendingProgram: KAMINO_LENDING_PROGRAM,
      basketAccounts: basketAccountsByAddress,
      ownWallets,
      ...(self === undefined ? {} : { self }),
    }).filter((m) => m.mint === USDC_MINT);
  });
}
