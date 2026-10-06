type Holding = { readonly ticker: string; readonly weightBps: number };

export type AllocationTile<T extends Holding> =
  | { readonly kind: "asset"; readonly ticker: string; readonly weightBps: number; readonly asset: T }
  | {
      readonly kind: "other";
      readonly ticker: "Other";
      readonly weightBps: number;
      readonly assets: readonly T[];
    };

/** Seven named holdings plus the rest, arranged as a compact target-weight mosaic. */
export const allocationRows = <T extends Holding>(holdings: readonly T[]): AllocationTile<T>[][] => {
  const sorted = [...holdings].sort((a, b) => b.weightBps - a.weightBps);
  const tiles: AllocationTile<T>[] = sorted.slice(0, 7).map((asset) => ({
    kind: "asset",
    ticker: asset.ticker,
    weightBps: asset.weightBps,
    asset,
  }));
  const remainingAssets = sorted.slice(7);
  const remaining = remainingAssets.reduce((sum, asset) => sum + asset.weightBps, 0);
  if (remaining > 0)
    tiles.push({ kind: "other", ticker: "Other", weightBps: remaining, assets: remainingAssets });
  if (tiles.length <= 2) return [tiles];
  if (tiles.length <= 5) return [tiles.slice(0, 2), tiles.slice(2)];
  return [tiles.slice(0, 2), tiles.slice(2, 4), tiles.slice(4)];
};
