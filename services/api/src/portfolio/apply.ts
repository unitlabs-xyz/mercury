import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { D, EMPTY_OPEN, replayPosition, type Decimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { activities, disposals, instruments, lots, orders, positions, tokens } from "../db/schema.js";
import { movementsByToken } from "./open.js";
import { planReconciliation, type HeldToken, type Reconciliation } from "./reconcile.js";

export interface ReconcileDeps {
  readonly chain: ChainReader;
  readonly prices: PriceBoard;
  readonly multipliers: MultiplierSource;
}

/**
 * How long an executing sell can hold its stock still. Long enough for a
 * person to sign and the network to land it. Within it, the stock sits a pass
 * out only while a wrapper of it reads below the records, since that drop may
 * be the sell; with no drop, nothing is held (`planReconciliation`). Past it,
 * an order nobody confirmed is taken as abandoned, and a drop in the chain is
 * read as a transfer; a confirm that does arrive later takes that transfer
 * back (`settleOrder`).
 */
const EXECUTING_WINDOW_MS = 10 * 60_000;

/**
 * How long a transfer out is provisional. A drop in the chain is not always a
 * send. Kamino is read at confirmed and the wallet at finalized, so on every
 * withdrawal the obligation empties some seconds before the wallet regains the
 * tokens, and for those seconds the chain reads low. A buy's lot can be
 * written before a lagging node shows its tokens, and a late confirm can race
 * the gap between a pass's read and its write. Each would otherwise become a
 * permanent transfer out, and the tokens coming back would count as arrivals
 * with no cost. Within this window a chain that reads above the records takes
 * the transfer out back (`planReconciliation`). Past it, the transfer stands.
 */
const PROVISIONAL_MS = 2 * 60_000;

/**
 * Everything `planReconciliation` needs: what the chain holds, what we recorded,
 * and what any of it is worth.
 *
 * Tokens we do not list are skipped rather than stored. A wallet holding some
 * unrelated memecoin is not a position in this product, and writing a row for it
 * would put it on the portfolio screen.
 */
export async function loadHeldTokens(
  db: Db,
  deps: ReconcileDeps,
  userId: string,
  walletAddress: string,
  now: Date = new Date(),
): Promise<readonly HeldToken[]> {
  const [balances, known, lotRows, disposalRows, settlingRows] = await Promise.all([
    // Finalized: this writes lots, and a dropped block would leave a purchase
    // that never happened.
    deps.chain.tokenBalances(walletAddress, "finalized"),
    db
      .select({
        tokenId: tokens.id,
        instrumentId: tokens.instrumentId,
        mint: tokens.mint,
        symbol: tokens.symbol,
        decimals: tokens.decimals,
        ticker: instruments.ticker,
        storedMultiplier: tokens.multiplier,
      })
      .from(tokens)
      .innerJoin(instruments, eq(instruments.id, tokens.instrumentId)),
    // Every lot and every disposal the user has, to be replayed. A token they
    // have emptied still needs a pass, or its position would stay stale at
    // what it used to be.
    db
      .select({
        id: lots.id,
        tokenId: lots.tokenId,
        tokenQty: lots.tokenQty,
        shares: lots.shares,
        unitCostUsd: lots.unitCostUsd,
        referencePriceUsd: lots.referencePriceUsd,
        feeUsd: lots.feeUsd,
        acquiredAt: lots.acquiredAt,
        // Microseconds, read by the database: a Date would drop them, and a
        // lot and a disposal can be recorded in the same millisecond.
        recordedAtUs: sql<number>`(extract(epoch from ${lots.recordedAt}) * 1000000)::bigint`.mapWith(Number),
        isEstimated: lots.isEstimated,
      })
      .from(lots)
      .where(eq(lots.userId, userId)),
    db
      .select({
        id: disposals.id,
        tokenId: disposals.tokenId,
        tokenQty: disposals.tokenQty,
        kind: disposals.kind,
        recordedAtUs: sql<number>`(extract(epoch from ${disposals.recordedAt}) * 1000000)::bigint`.mapWith(
          Number,
        ),
      })
      .from(disposals)
      .where(eq(disposals.userId, userId)),
    // Stocks with a sell executing. See `HeldToken.settling`. Whether one
    // holds its stock is for the plan to say, from what the chain reads.
    db
      .selectDistinct({ instrumentId: orders.instrumentId })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.side, "sell"),
          eq(orders.status, "executing"),
          gt(orders.createdAt, new Date(now.getTime() - EXECUTING_WINDOW_MS)),
        ),
      ),
  ]);

  const onChain = new Map(balances.map((b) => [b.mint, b.rawAmount]));
  const open = new Map(
    [...movementsByToken(lotRows, disposalRows)].map(([tokenId, moves]) => [tokenId, replayPosition(moves)]),
  );
  const settling = new Set(settlingRows.map((r) => r.instrumentId));
  // Every disposal is replayed, young or not, so a dividend written beside a
  // transfer out keeps replaying after it. Only the young transfers out are
  // listed here, to be taken back if the chain reads above the records.
  const youngAfterUs = (now.getTime() - PROVISIONAL_MS) * 1000;
  const provisional = new Map<string, string[]>();
  for (const d of disposalRows) {
    if (d.kind !== "transfer_out" || d.recordedAtUs <= youngAfterUs) continue;
    const ids = provisional.get(d.tokenId);
    if (ids === undefined) provisional.set(d.tokenId, [d.id]);
    else ids.push(d.id);
  }
  const relevant = known.filter((t) => onChain.has(t.mint) || open.has(t.tokenId));
  if (relevant.length === 0) return [];

  const mints = relevant.map((t) => t.mint);
  // Both reads at once, and each as one ask for every mint. This used to fetch
  // the board and then walk the tokens asking the mint about them one at a
  // time, which `position-sync` paid for once per wallet every two seconds.
  const [board, multipliers] = await Promise.all([
    deps.prices.pricesFor(mints),
    deps.multipliers.multipliersFor(mints),
  ]);

  return relevant.map((token) => {
    const held = open.get(token.tokenId) ?? EMPTY_OPEN;
    const price = board.get(token.mint);
    // The mint is the authority on the multiplier; the price board is the
    // fallback; the stored value is what we last saw. Never 1 by default —
    // that would shrink the shares of every holder of a paying token.
    const multiplier = multipliers.get(token.mint) ?? price?.multiplier ?? D(token.storedMultiplier);

    return {
      tokenId: token.tokenId,
      instrumentId: token.instrumentId,
      mint: token.mint,
      symbol: token.symbol,
      ticker: token.ticker,
      decimals: token.decimals,
      multiplier,
      referencePricePerShare: price?.pricePerShare ?? null,
      chainRawAmount: onChain.get(token.mint) ?? 0n,
      recordedRawAmount: held.tokenQty,
      recordedShares: held.shares,
      recordedCostUsd: held.costUsd,
      recordedReferenceUsd: held.referenceUsd,
      recordedFeeUsd: held.feeUsd,
      settling: settling.has(token.instrumentId),
      provisional: provisional.get(token.tokenId) ?? [],
    } satisfies HeldToken;
  });
}

const fixed = (v: Decimal): string => v.toFixed(18);

/** Writes what the plan decided. One transaction, so a half-written pass cannot exist. */
export async function applyReconciliation(db: Db, userId: string, plan: Reconciliation): Promise<void> {
  if (
    plan.lots.length === 0 &&
    plan.disposals.length === 0 &&
    plan.retracted.length === 0 &&
    plan.positions.length === 0
  ) {
    return;
  }

  await db.transaction(async (tx) => {
    if (plan.retracted.length > 0) {
      await tx
        .delete(disposals)
        .where(and(eq(disposals.userId, userId), inArray(disposals.id, [...plan.retracted])));
    }

    if (plan.lots.length > 0) {
      await tx.insert(lots).values(
        plan.lots.map((l) => ({
          userId,
          tokenId: l.tokenId,
          instrumentId: l.instrumentId,
          tokenQty: l.tokenQty,
          shares: fixed(l.shares),
          unitCostUsd: fixed(l.unitCostUsd),
          acquiredAt: l.acquiredAt,
          source: l.source,
          isEstimated: l.isEstimated,
        })),
      );
    }

    if (plan.disposals.length > 0) {
      await tx.insert(disposals).values(
        plan.disposals.map((d) => ({
          userId,
          tokenId: d.tokenId,
          instrumentId: d.instrumentId,
          tokenQty: d.tokenQty,
          shares: fixed(d.shares),
          kind: d.kind,
          occurredAt: d.occurredAt,
        })),
      );
    }

    if (plan.activity.length > 0) {
      await tx.insert(activities).values(
        plan.activity.map((a) => ({
          userId,
          kind: a.kind,
          occurredAt: a.occurredAt,
          title: a.title,
          subtitle: a.subtitle,
          amountUsd: a.amountUsd === null ? null : fixed(a.amountUsd),
          refTable: a.refTable,
          refId: a.refId,
        })),
      );
    }

    for (const p of plan.positions) {
      await tx
        .insert(positions)
        .values({
          userId,
          instrumentId: p.instrumentId,
          shares: fixed(p.shares),
          sharesWithBasis: fixed(p.sharesWithBasisUsd),
          costBasisUsd: fixed(p.costBasisUsd),
          referenceBasisUsd: fixed(p.referenceBasisUsd),
          feeUsd: fixed(p.feeUsd),
          avgUnitCostUsd: fixed(p.avgUnitCostUsd),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [positions.userId, positions.instrumentId],
          set: {
            shares: fixed(p.shares),
            sharesWithBasis: fixed(p.sharesWithBasisUsd),
            costBasisUsd: fixed(p.costBasisUsd),
            referenceBasisUsd: fixed(p.referenceBasisUsd),
            feeUsd: fixed(p.feeUsd),
            avgUnitCostUsd: fixed(p.avgUnitCostUsd),
            updatedAt: new Date(),
          },
        });
    }
  });
}

/**
 * Read, plan, write. This was how the portfolio followed the chain while the
 * read did the writing; the `position-sync` job took it over, and the read
 * stopped writing, exactly as planned.
 *
 * Nothing calls it now.
 */
export async function reconcile(
  db: Db,
  deps: ReconcileDeps,
  userId: string,
  walletAddress: string,
): Promise<void> {
  const held = await loadHeldTokens(db, deps, userId, walletAddress);
  if (held.length === 0) return;
  await applyReconciliation(db, userId, planReconciliation(held, new Date()));
}
