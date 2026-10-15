import type { ReactNode } from "react";
import { allocationRows, weightLabel, type AllocationTile } from "@mercury/view";
import type { Instrument } from "../../market/hooks";
import { AssetIcon } from "./AssetIcon";

const TONES = [
  "bg-[#e9f2ed]",
  "bg-[#e9edf5]",
  "bg-[#f4eee7]",
  "bg-[#eeeaf4]",
  "bg-[#e7f1f1]",
  "bg-[#f3f1e9]",
  "bg-ds-tag",
];

type Holding = { readonly ticker: string; readonly mint: string; readonly weightBps: number };

/** Weight is the only thing sizing a tile, so the picture cannot disagree with the numbers. */
const grow = (weightBps: number) => ({ flexGrow: weightBps, flexBasis: 0 });

export const Mosaic = <T extends Holding>({
  holdings,
  instruments,
  tile,
}: {
  holdings: readonly T[];
  instruments: ReadonlyMap<string, Instrument>;
  /** Wraps a tile, so the caller decides what clicking one does. */
  tile: (tile: AllocationTile<T>, body: ReactNode) => ReactNode;
}) => (
  <div className="flex h-[290px] flex-col gap-1.5" aria-label="Target allocation">
    {allocationRows(holdings).map((row, rowIndex) => (
      <div
        key={rowIndex}
        className="flex min-h-0 gap-1.5"
        style={grow(row.reduce((sum, item) => sum + item.weightBps, 0))}
      >
        {row.map((item, index) => (
          <div key={item.ticker} style={grow(item.weightBps)} className="min-w-0">
            {tile(
              item,
              <>
                <span
                  aria-hidden="true"
                  className={`basket-allocation-color pointer-events-none absolute -inset-3 ${
                    TONES[(rowIndex * 2 + index) % TONES.length]
                  }`}
                />
                <span className="basket-allocation-content">
                  {item.kind === "asset" ? (
                    <AssetIcon
                      asset={item.asset}
                      source={instruments.get(item.ticker)}
                      className="size-6 shrink-0 rounded-full object-contain transition-transform duration-300 motion-safe:group-hover:scale-110 motion-reduce:transition-none"
                    />
                  ) : (
                    <span className="flex shrink-0 items-center -space-x-2 pl-0.5">
                      {item.assets.slice(0, 3).map((asset) => (
                        <AssetIcon
                          key={asset.ticker}
                          asset={asset}
                          source={instruments.get(asset.ticker)}
                          className="size-6 rounded-full bg-white object-contain ring-2 ring-white"
                        />
                      ))}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[12px] font-medium text-ds-ink">{item.ticker}</span>
                    <span className="text-[11px] text-ds-muted">
                      {weightLabel(item.weightBps)}
                      {item.kind === "other" ? ` · ${item.assets.length} assets` : ""}
                    </span>
                  </span>
                </span>
              </>,
            )}
          </div>
        ))}
      </div>
    ))}
  </div>
);

/** Shared by every wrapper, so a link and a plain tile look identical. */
export const TILE_CLASS =
  "basket-allocation-tile group block size-full min-w-0 overflow-hidden rounded-lg px-2.5 text-left transition-transform duration-300 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none sm:px-3";
