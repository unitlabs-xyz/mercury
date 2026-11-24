import { and, eq, gte, inArray } from "drizzle-orm";
import { D, Decimal, ZERO } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, disposals, lots, positions, tokens, wallets } from "../db/schema.js";

export interface MoveRecord {
  readonly userId: string;
  /** The linked wallet the tokens left. */
  readonly fromWalletId: string;
  /** The person's Mercury wallet, where they arrived. */
  readonly toWalletId: string;
  readonly signature: string;
  readonly occurredAt: Date;
  /** When the move was built: a transfer out position-sync wrote for these tokens since is this move, seen early. */
  readonly startedAt: Date;
  readonly moved: readonly { readonly mint: string; readonly amountRaw: bigint }[];
}

const fixed = (d: Decimal) => d.toFixed();
const scaled = (raw: bigint, decimals: number) => D(raw.toString()).div(D(10).pow(decimals));

/**
 * One landed move, written into the books: the shares leave the linked
 * wallet's records and arrive in the Mercury wallet's with the cost they had.
 *
 * Between two wallets of the same person the cost travels with the shares,
 * exact or estimated as it was: the Mercury wallet inherits the linked
 * wallet's average cost on the moved shares, and shares it had no cost for
 * arrive with none. Each moved stock is a transfer out of the linked wallet,
 * at average cost so what stays behind keeps its own, and a lot in the
 * Mercury wallet. USDC carries no lot; it gets its feed rows.
 *
 * Position-sync may see the tokens leave before this runs and write the
 * departure itself; that young transfer out is taken back here, so the shares
 * leave once. The feed row is the record that it was done: a second call for
 * the same signature writes nothing.
 */
export async function recordMove(db: Db, input: MoveRecord): Promise<{ written: boolean }> {
  const [from] = await db
    .select({ label: wallets.label, address: wallets.address })
    .from(wallets)
    .where(eq(wallets.id, input.fromWalletId))
    .limit(1);
  const name =
    from?.label ??
    (from === undefined ? "a linked wallet" : `${from.address.slice(0, 4)}…${from.address.slice(-4)}`);
  const mints = input.moved.map((m) => m.mint);
  const stocks = await db
    .select({
      id: tokens.id,
      mint: tokens.mint,
      instrumentId: tokens.instrumentId,
      decimals: tokens.decimals,
      multiplier: tokens.multiplier,
    })
    .from(tokens)
    .where(inArray(tokens.mint, mints));

  return db.transaction(async (tx) => {
    let written = false;
    for (const m of input.moved) {
      if (m.amountRaw <= 0n) continue;
      // The feed row on the linked side is the record that this move was taken in.
      const [first] = await tx
        .insert(activities)
        .values({
          userId: input.userId,
          walletId: input.fromWalletId,
          kind: "transfer_out",
          occurredAt: input.occurredAt,
          title: "Moved to your Mercury wallet",
          subtitle: null,
          amountUsd: null,
          txSignature: input.signature,
          mint: m.mint,
        })
        .onConflictDoNothing()
        .returning({ id: activities.id });
      if (first === undefined) continue;
      written = true;
      await tx
        .insert(activities)
        .values({
          userId: input.userId,
          walletId: input.toWalletId,
          kind: "transfer_in",
          occurredAt: input.occurredAt,
          title: `Moved from ${name}`,
          subtitle: null,
          amountUsd: null,
          txSignature: input.signature,
          mint: m.mint,
        })
        .onConflictDoNothing();

      const stock = stocks.find((s) => s.mint === m.mint);
      if (stock === undefined) continue; // USDC and the like: no lot to carry

      const multiplier = D(stock.multiplier);
      const shares = scaled(m.amountRaw, stock.decimals).mul(multiplier);

      // A departure position-sync already wrote for this move: taken back, so the shares leave once.
      await tx
        .delete(disposals)
        .where(
          and(
            eq(disposals.walletId, input.fromWalletId),
            eq(disposals.tokenId, stock.id),
            eq(disposals.kind, "transfer_out"),
            gte(disposals.recordedAt, input.startedAt),
          ),
        );
      await tx.insert(disposals).values({
        userId: input.userId,
        walletId: input.fromWalletId,
        tokenId: stock.id,
        instrumentId: stock.instrumentId,
        tokenQty: m.amountRaw,
        shares: fixed(shares),
        kind: "transfer_out",
        occurredAt: input.occurredAt,
      });

      // What those shares cost in the linked wallet, as its position last had it.
      const [there] = await tx
        .select({
          shares: positions.shares,
          sharesWithBasis: positions.sharesWithBasis,
          avg: positions.avgUnitCostUsd,
          referenceBasis: positions.referenceBasisUsd,
          estimated: positions.estimatedCostUsd,
        })
        .from(positions)
        .where(
          and(eq(positions.walletId, input.fromWalletId), eq(positions.instrumentId, stock.instrumentId)),
        )
        .limit(1);
      const held = there === undefined ? ZERO : D(there.shares);
      const withBasis = there === undefined ? ZERO : D(there.sharesWithBasis);
      // Shares it had no cost for arrive with none, as they were.
      const covered = held.gt(ZERO) ? Decimal.min(withBasis.div(held), D(1)) : ZERO;
      const costedRaw = BigInt(D(m.amountRaw.toString()).mul(covered).floor().toFixed());
      if (there === undefined || costedRaw <= 0n || !D(there.avg).gt(ZERO)) continue;

      const reference = withBasis.gt(ZERO) ? D(there.referenceBasis).div(withBasis) : D(there.avg);
      const estimated = D(there.estimated).gt(ZERO);
      await tx.insert(lots).values({
        userId: input.userId,
        walletId: input.toWalletId,
        tokenId: stock.id,
        instrumentId: stock.instrumentId,
        tokenQty: costedRaw,
        shares: fixed(scaled(costedRaw, stock.decimals).mul(multiplier)),
        unitCostUsd: fixed(D(there.avg)),
        feeUsd: "0",
        referencePriceUsd: fixed(reference),
        acquiredAt: input.occurredAt,
        source: "transfer_in",
        isEstimated: estimated,
        estimateSource: estimated ? "own_wallet" : null,
      });
    }
    return { written };
  });
}
