import { D, type Movement } from "@mercury/core";

/** A lot as `loadHeldTokens` reads it. */
export interface LotRow {
  readonly id: string;
  readonly tokenId: string;
  readonly tokenQty: bigint;
  readonly shares: string;
  readonly unitCostUsd: string;
  readonly referencePriceUsd: string | null;
  readonly feeUsd: string;
  readonly acquiredAt: Date;
  /**
   * When it was recorded, in microseconds since the epoch. Not a Date: a Date
   * keeps milliseconds, and a lot and a disposal can land in the same one.
   */
  readonly recordedAtUs: number;
  readonly isEstimated: boolean;
}

/** A disposal as `loadHeldTokens` reads it. */
export interface DisposalRow {
  readonly id: string;
  readonly tokenId: string;
  readonly tokenQty: bigint;
  /** As on `LotRow`. */
  readonly recordedAtUs: number;
}

interface Entry {
  readonly tokenId: string;
  readonly at: number;
  /** In before out, at the same instant. */
  readonly rank: 0 | 1;
  readonly id: string;
  readonly movement: Movement;
}

/**
 * Each token's lots and disposals as one sequence, in the order they entered
 * and left Mercury, ready for `replayPosition`.
 *
 * A lot and a disposal recorded in the same instant go in before out, so a buy
 * and a sell in one millisecond cannot empty a holding that was never empty.
 * The id breaks any tie that is left, so the same rows always replay the same
 * way.
 */
export function movementsByToken(
  lots: readonly LotRow[],
  disposals: readonly DisposalRow[],
): Map<string, Movement[]> {
  const entries: Entry[] = [
    ...lots.map((l): Entry => {
      const shares = D(l.shares);
      return {
        tokenId: l.tokenId,
        at: l.recordedAtUs,
        rank: 0,
        id: l.id,
        movement: {
          kind: "in",
          tokenQty: l.tokenQty,
          shares,
          costUsd: shares.mul(D(l.unitCostUsd)),
          // A lot written before the reference was recorded falls back to the
          // price it executed at, which reads as no premium paid. Guessing one
          // from today's quote would book a market move that never happened.
          referenceUsd: shares.mul(D(l.referencePriceUsd ?? l.unitCostUsd)),
          feeUsd: D(l.feeUsd),
          acquiredAt: l.acquiredAt,
          isEstimated: l.isEstimated,
        },
      };
    }),
    ...disposals.map((d): Entry => ({
      tokenId: d.tokenId,
      at: d.recordedAtUs,
      rank: 1,
      id: d.id,
      movement: { kind: "out", tokenQty: d.tokenQty },
    })),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank || a.id.localeCompare(b.id));

  const byToken = new Map<string, Movement[]>();
  for (const e of entries) byToken.set(e.tokenId, [...(byToken.get(e.tokenId) ?? []), e.movement]);
  return byToken;
}
