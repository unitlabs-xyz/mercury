import { memo } from "react";
import { Link } from "react-router-dom";
import { MoveChip } from "../../ui/ds";
import { DotChart, TINY } from "../DotChart";
import { usd } from "@mercury/view";
import { LIST_DOT, Mark, points } from "../invest/shared";
import type { Leg, Valued } from "./model";

/**
 * A basket's face: the logos of its heaviest stocks, overlapping by a third,
 * each ringed in the surface it sits on so the edges read. "+3" for the rest.
 */
export const Stack = ({
  legs,
  size = 28,
  shown = 3,
  ring = "ring-ds-panel",
}: {
  legs: readonly Leg[];
  size?: number;
  shown?: number;
  /** The colour behind the stack: the grey list panel, or white on a card. */
  ring?: string;
}) => {
  const top = [...legs].sort((a, b) => b.target - a.target).slice(0, shown);
  const rest = legs.length - top.length;
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {top.map((l, k) => (
        <span
          key={l.ticker}
          className={`relative rounded-full ring-2 ${ring}`}
          style={{ marginLeft: k === 0 ? 0 : -size / 3, zIndex: shown - k }}
        >
          {l.instrument ? (
            <Mark i={l.instrument} size={size} />
          ) : (
            <span
              style={{ width: size, height: size }}
              className="grid place-items-center rounded-full bg-chip text-[10px] font-bold text-ink-soft"
            >
              {l.ticker.slice(0, 2)}
            </span>
          )}
        </span>
      ))}
      {rest > 0 && (
        <span
          className={`relative grid place-items-center rounded-full ${ring === "ring-white" ? "bg-ds-panel" : "bg-white"} ${size < 28 ? "text-[9px]" : "text-[11px]"} leading-none font-medium text-ds-muted ring-2 ${ring}`}
          // The count sits in the part the last logo leaves showing.
          style={{ width: size, height: size, marginLeft: -size / 3, paddingLeft: size / 3 }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
};

/**
 * One basket in a rail list (Your baskets, Other baskets), set like the
 * watchlist row: the stack, the name at 14 medium over its size at 12, a
 * sparkline, and the value over its move on the right, in a 52px row.
 */
export const BasketLine = memo(({ v, figure, sub }: { v: Valued; figure: number | null; sub: string }) => (
  <Link
    data-row
    to={`/baskets/${v.basket.slug}`}
    className="relative grid h-[52px] grid-cols-[minmax(0,1fr)_84px_64px] items-center gap-x-3 rounded-md px-3"
  >
    <span className="flex min-w-0 items-center gap-3">
      <Stack legs={v.legs} size={24} shown={2} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
          {v.basket.name}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">{sub}</span>
      </span>
    </span>
    <span className="flex items-center">
      <span className="block h-7 w-full">
        {v.series && (
          <DotChart
            scale="price"
            series={points(v.series, "1D")}
            label="today"
            axes={false}
            interactive={false}
            rest={LIST_DOT}
            {...TINY}
          />
        )}
      </span>
    </span>
    <span className="flex flex-col items-end">
      <span className="text-[14px] leading-[18px] font-medium whitespace-nowrap text-ds-ink">
        {usd(figure)}
      </span>
      <span className="mt-0.5">
        <MoveChip value={v.todayPct} light />
      </span>
    </span>
  </Link>
));
BasketLine.displayName = "BasketLine";

/**
 * How much of the basket one stock is, against its heaviest: a 4px track, filled to where the weight
 * has drifted, with a hairline tick where it was set. Nothing rebalances in
 * version one, so the gap between the two is the drift, and it is shown.
 */
export const WeightBar = ({ leg, max }: { leg: Leg; max: number }) => {
  const now = leg.current ?? leg.target;
  // Against the basket's heaviest stock, so a seven-way split still reads.
  const at = (w: number) => `${Math.min(100, (w / max) * 100)}%`;
  return (
    <span className="relative block h-1 w-full rounded-full bg-ds-tag">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-ds-ink/80 transition-[width] duration-500"
        style={{ width: at(now) }}
      />
      <span
        className="absolute -top-1 h-3 w-px bg-ds-ink"
        style={{ left: at(leg.target) }}
        title={`Set to ${(leg.target * 100).toFixed(2)}%`}
      />
    </span>
  );
};

/** "14.3%": a weight at the precision a reader can use. */
export const weight = (w: number | null) => (w === null ? "—" : `${(w * 100).toFixed(1)}%`);
