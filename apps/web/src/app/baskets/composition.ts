import { TOTAL_BPS, equalWeights, problemWith, type DraftProblem } from "@mercury/core";
import type { PickableBasketAsset } from "@mercury/types";

export interface Pick {
  readonly assetId: string;
  readonly ticker: string;
  readonly name: string;
  readonly mint: string;
  readonly logoUrl: string | null;
  readonly weightBps: number;
  /** Held at its weight: levelling fills around it rather than over it. */
  readonly locked: boolean;
}

export interface Composition {
  readonly name: string;
  readonly description: string;
  readonly picks: readonly Pick[];
}

export const EMPTY: Composition = { name: "", description: "", picks: [] };

/**
 * Share what is not held, evenly, over whatever the locks leave.
 *
 * Levelling is the one move that touches every weight, so it is also where a
 * lock has to be honoured: a held weight stays exactly as typed, and the rest
 * divide the remainder between them.
 */
const levelled = (picks: readonly Pick[]): Pick[] => {
  const free = picks.filter((pick) => !pick.locked).length;
  if (free === 0) return [...picks];
  const held = picks.reduce((sum, pick) => sum + (pick.locked ? pick.weightBps : 0), 0);
  const share = equalWeights(free, Math.max(0, TOTAL_BPS - held));
  let next = 0;
  return picks.map((pick) => (pick.locked ? pick : { ...pick, weightBps: share[next++]! }));
};

export const added = (composition: Composition, asset: PickableBasketAsset): Composition =>
  composition.picks.some((pick) => pick.assetId === asset.assetId)
    ? composition
    : {
        ...composition,
        picks: levelled([...composition.picks, { ...asset, weightBps: 0, locked: false }]),
      };

/**
 * Move a stock to sit where another one is.
 *
 * Order is the author's own: it decides how the basket reads, and which pick
 * carries the rounding remainder when weights are levelled.
 */
export const reordered = (composition: Composition, movedId: string, beforeId: string): Composition => {
  const from = composition.picks.findIndex((pick) => pick.assetId === movedId);
  const to = composition.picks.findIndex((pick) => pick.assetId === beforeId);
  if (from === -1 || to === -1 || from === to) return composition;
  const picks = [...composition.picks];
  const [moved] = picks.splice(from, 1);
  picks.splice(to, 0, moved!);
  return { ...composition, picks };
};

/** Holding a weight, or letting it move again. */
export const toggledLock = (composition: Composition, assetId: string): Composition => ({
  ...composition,
  picks: composition.picks.map((pick) =>
    pick.assetId === assetId ? { ...pick, locked: !pick.locked } : pick,
  ),
});

export const removed = (composition: Composition, assetId: string): Composition => ({
  ...composition,
  picks: levelled(composition.picks.filter((pick) => pick.assetId !== assetId)),
});

export const distributed = (composition: Composition): Composition => ({
  ...composition,
  picks: levelled(composition.picks),
});

/**
 * One weight, clamped to what a basket can hold. The others are left alone:
 * the shortfall shows as `remaining` and the create button stays shut, which
 * is a truer account than silently taking the difference off somebody else.
 */
export const weighted = (composition: Composition, assetId: string, weightBps: number): Composition => ({
  ...composition,
  picks: composition.picks.map((pick) =>
    pick.assetId === assetId
      ? { ...pick, weightBps: Math.max(0, Math.min(TOTAL_BPS, Math.round(weightBps))) }
      : pick,
  ),
});

/** Positive when there is still weight to give out, negative when overspent. */
export const remaining = (composition: Composition): number =>
  TOTAL_BPS - composition.picks.reduce((sum, pick) => sum + pick.weightBps, 0);

export const asDraft = (composition: Composition) => ({
  name: composition.name.trim(),
  description: composition.description.trim(),
  assets: composition.picks.map(({ assetId, weightBps }) => ({ assetId, weightBps })),
});

/** Null when it could be created. The same rule, and the same codes, the API answers with. */
export const problem = (composition: Composition, holdable: ReadonlySet<string>): DraftProblem | null =>
  problemWith(asDraft(composition), holdable);
