import { useState, type DragEvent } from "react";
import { weightLabel } from "@mercury/view";
import type { Instrument } from "../../market/hooks";
import { GlideTable } from "../../ui/ds";
import { Close, Lock } from "../../ui/icons";
import { AssetIcon } from "./AssetIcon";
import { removed, reordered, toggledLock, weighted, type Composition } from "./composition";

/* One cluster on the right rather than three columns, so the controls sit the
   same distance apart whatever the weight reads. */
const COLS = "grid-cols-[14px_minmax(0,1fr)_auto]";

/**
 * Two gestures, two types.
 *
 * They must be told apart during `dragover`, where the payload cannot be read
 * — only its type. One is a copy from the picker and the other a move within
 * the list, and a handler that guesses wrong sets an effect the source never
 * allowed, which the browser resolves to "none" and then drops nothing.
 */
export const ASSET_DRAG = "application/x-mercury-asset";
export const PICK_DRAG = "application/x-mercury-pick";

/** Six dots, the handle every reorderable list uses. */
const Grip = () => (
  <svg viewBox="0 0 10 16" width={10} height={16} aria-hidden className="shrink-0">
    {[3, 8, 13].map((y) => (
      <g key={y} fill="currentColor">
        <circle cx={2} cy={y} r={1.1} />
        <circle cx={8} cy={y} r={1.1} />
      </g>
    ))}
  </svg>
);

export const Weights = ({
  composition,
  instruments,
  onChange,
}: {
  composition: Composition;
  instruments: ReadonlyMap<string, Instrument>;
  onChange: (next: Composition) => void;
}) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const dropOn = (assetId: string) => (event: DragEvent) => {
    const moved = event.dataTransfer.getData(PICK_DRAG);
    setOver(null);
    if (moved === "") return; // an arrival from the picker; the panel takes it
    event.preventDefault();
    event.stopPropagation();
    if (moved !== assetId) onChange(reordered(composition, moved, assetId));
  };

  return (
    <GlideTable
      columns={COLS}
      minWidth="min-w-0"
      sheet="bg-ds-panel"
      headings={
        <>
          <span />
          <span>Stock</span>
          <span className="pr-16 text-right">Weight</span>
        </>
      }
    >
      {composition.picks.map((pick) => (
        <li
          key={pick.assetId}
          data-row
          className="relative"
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(PICK_DRAG)) return;
            /* Without an explicit effect the browser resolves "none" against a
               source that allowed only "move", and never fires the drop. */
            event.dataTransfer.dropEffect = "move";
            event.preventDefault();
            setOver(pick.assetId);
          }}
          onDragLeave={() => setOver((at) => (at === pick.assetId ? null : at))}
          onDrop={dropOn(pick.assetId)}
        >
          {/* Where it would land, drawn on the gap rather than by moving rows. */}
          {over === pick.assetId && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-px right-2 left-2 z-10 h-0.5 rounded-full bg-ds-link"
            />
          )}
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(PICK_DRAG, pick.assetId);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setOver(null)}
            className={`relative grid h-13 ${COLS} cursor-grab items-center gap-x-3 rounded-md px-4 active:cursor-grabbing`}
          >
            <span className="text-ds-muted/40 transition-colors group-hover/list:text-ds-muted/70">
              <Grip />
            </span>

            <span className="flex min-w-0 items-center gap-3">
              <AssetIcon
                asset={pick}
                source={instruments.get(pick.ticker)}
                className="size-7 shrink-0 rounded-full bg-white object-contain"
              />
              <span className="min-w-0">
                <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                  {instruments.get(pick.ticker)?.name ?? pick.name}
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                  {pick.ticker}
                </span>
              </span>
            </span>

            <span className="flex items-center gap-1">
              {editing === pick.assetId ? (
                <span className="flex w-[76px] items-baseline justify-end rounded-md bg-white px-2 py-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
                  <input
                    autoFocus
                    inputMode="decimal"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={Number((pick.weightBps / 100).toFixed(2))}
                    onChange={(event) =>
                      onChange(weighted(composition, pick.assetId, Number(event.target.value || 0) * 100))
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(event) =>
                      (event.key === "Enter" || event.key === "Escape") && setEditing(null)
                    }
                    aria-label={`${pick.ticker} weight, percent`}
                    /* The browser's spinners are heavier than the figure beside them. */
                    className="w-full bg-transparent text-right text-[14px] font-medium tabular-nums text-ds-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="pl-0.5 text-[12px] text-ds-muted">%</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(pick.assetId)}
                  aria-label={`Set ${pick.ticker} weight`}
                  className="w-[76px] rounded-md px-2 py-1 text-right text-[14px] font-medium tabular-nums text-ds-ink transition-shadow hover:shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
                >
                  {weightLabel(pick.weightBps)}
                </button>
              )}

              {/* Always there, just quiet: an affordance that only exists on
                  hover is one most people never find. */}
              <button
                type="button"
                onClick={() => onChange(toggledLock(composition, pick.assetId))}
                aria-label={`${pick.locked ? "Release" : "Hold"} ${pick.ticker} at ${weightLabel(pick.weightBps)}`}
                aria-pressed={pick.locked}
                className={`grid size-7 shrink-0 place-items-center rounded-full transition-colors ${
                  pick.locked
                    ? "bg-ds-act-buy-bg text-ds-act-buy"
                    : "text-ds-muted/50 hover:bg-ds-tag hover:text-ds-ink"
                }`}
              >
                <Lock className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange(removed(composition, pick.assetId))}
                aria-label={`Remove ${pick.ticker}`}
                className="grid size-7 shrink-0 place-items-center rounded-full text-ds-muted/50 transition-colors hover:bg-ds-tag hover:text-ds-ink"
              >
                <Close className="size-3.5" />
              </button>
            </span>
          </div>
        </li>
      ))}
    </GlideTable>
  );
};
