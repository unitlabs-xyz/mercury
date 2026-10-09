import { eq, sql } from "drizzle-orm";
import { D, ZERO, type Decimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { activities, instruments, lots, positions, tokens } from "../db/schema.js";
import { planReconciliation, type HeldToken, type Reconciliation } from "./reconcile.js";

export interface ReconcileDeps {
  readonly chain: ChainReader;
  readonly prices: PriceBoard;
  readonly multipliers: MultiplierSource;
}

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
): Promise<readonly HeldToken[]> {
  const [balances, known, recorded] = await Promise.all([
    deps.chain.tokenBalances(walletAddress),
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
    // Every token the user has lots for. One they have emptied still needs a
    // pass, or its position would stay stale at what it used to be.
    db
      .select({
        tokenId: lots.tokenId,
        rawAmount: sql<string>`coalesce(sum(${lots.tokenQty}), 0)`,
        shares: sql<string>`coalesce(sum(${lots.shares}), 0)`,
        cost: sql<string>`coalesce(sum(${lots.shares} * ${lots.unitCostUsd}), 0)`,
      })
      .from(lots)
      .where(eq(lots.userId, userId))
      .groupBy(lots.tokenId),
  ]);

  const onChain = new Map(balances.map((b) => [b.mint, b.rawAmount]));
  const recordedByToken = new Map(recorded.map((r) => [r.tokenId, r]));
  const relevant = known.filter((t) => onChain.has(t.mint) || recordedByToken.has(t.tokenId));
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
    const row = recordedByToken.get(token.tokenId);
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
      recordedRawAmount: row === undefined ? 0n : BigInt(row.rawAmount),
      recordedShares: row === undefined ? ZERO : D(row.shares),
      recordedCostUsd: row === undefined ? ZERO : D(row.cost),
    } satisfies HeldToken;
  });
}

const fixed = (v: Decimal): string => v.toFixed(18);

/** Writes what the plan decided. One transaction, so a half-written pass cannot exist. */
export async function applyReconciliation(db: Db, userId: string, plan: Reconciliation): Promise<void> {
  if (plan.lots.length === 0 && plan.positions.length === 0) return;

  await db.transaction(async (tx) => {
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
          avgUnitCostUsd: fixed(p.avgUnitCostUsd),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [positions.userId, positions.instrumentId],
          set: {
            shares: fixed(p.shares),
            sharesWithBasis: fixed(p.sharesWithBasisUsd),
            costBasisUsd: fixed(p.costBasisUsd),
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
