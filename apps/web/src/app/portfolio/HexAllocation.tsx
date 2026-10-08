import { useMemo, useState } from "react";
import { usd } from "@mercury/view";

export type Slice = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly description?: string;
  /** Today's move in percent, or null where nothing moves (cash). */
  readonly changePct: number | null;
};

/** Fixed order, never cycled: slice i always wears series i+1. Validated as a set in tokens.css. */
const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
];

/** The subtle sheen on every cell and legend dot: a touch lighter top right, a touch deeper bottom left. */
const LIGHT = (c: string) => `color-mix(in oklab, ${c}, white 20%)`;
const DEEP = (c: string) => `color-mix(in oklab, ${c}, black 12%)`;
const dotFill = (c: string) => `linear-gradient(to bottom left, ${LIGHT(c)}, ${DEEP(c)})`;
const gradId = (i: number) => `alloc-sheen-${i}`;

const COLS = 20;
const ROWS = 12;
/** Rows of empty hexes kept above and below the blob, so it never runs edge to edge. */
const MARGIN = 1;
/** Columns of empty hexes added either side, so the grid spans the full 436 × 208 slot. */
const SIDE = 2;
const R = 10; // hex circumradius, pointy-top
const W = Math.sqrt(3) * R;
const FILLED = 124;

type Cell = { x: number; y: number; row: number; d: number; angle: number };

/**
 * The grid and which cells form the blob. Deterministic: an ellipse roughened by
 * two low-frequency sines, so the outline looks drawn rather than computed, and
 * the same account always draws the same shape.
 */
const layout = () => {
  const cells: Cell[] = [];
  const cx = ((COLS - 1) * W + W / 2) / 2 + W / 2;
  const cy = ((ROWS - 1) * R * 1.5) / 2 + R;
  // Extra rows either side of the blob's own, so there is always room for the margin.
  for (let row = -MARGIN; row < ROWS + MARGIN; row++) {
    for (let col = -SIDE; col < COLS + SIDE; col++) {
      const x = W / 2 + col * W + (row % 2 ? W / 2 : 0);
      const y = R + row * R * 1.5;
      const dx = (x - cx) / (COLS * W * 0.3);
      const dy = (y - cy) / (ROWS * R * 1.5 * 0.36);
      const angle = Math.atan2(dy, dx);
      const rough = 1 + 0.16 * Math.sin(angle * 3 + 0.8) + 0.08 * Math.sin(angle * 5 + 2.1);
      cells.push({ x, y, row, d: Math.hypot(dx, dy) / rough, angle });
    }
  }
  const filled = [...cells].sort((a, b) => a.d - b.d).slice(0, FILLED);
  const inside = new Set(filled);
  // Crop to the rows the blob uses plus one empty row above and below.
  const top = Math.min(...filled.map((c) => c.row)) - MARGIN;
  const bottom = Math.max(...filled.map((c) => c.row)) + MARGIN;
  const lift = (c: Cell): Cell => ({ ...c, x: c.x + SIDE * W, y: c.y - top * R * 1.5 });
  return {
    empty: cells.filter((c) => !inside.has(c) && c.row >= top && c.row <= bottom).map(lift),
    // A sweep from twelve o'clock, so each slice is one contiguous region.
    filled: filled
      .sort(
        (a, b) => ((a.angle + Math.PI * 2.5) % (Math.PI * 2)) - ((b.angle + Math.PI * 2.5) % (Math.PI * 2)),
      )
      .map(lift),
    width: (COLS + SIDE * 2) * W + W / 2,
    height: (bottom - top) * R * 1.5 + R * 2,
  };
};

const hex = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/** Largest-remainder rounding, so the cell counts always add up to the blob. */
const apportion = (values: readonly number[], total: number) => {
  const sum = values.reduce((s, v) => s + v, 0) || 1;
  const raw = values.map((v) => (v / sum) * total);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < total - out.reduce((s, v) => s + v, 0); k++) out[order[k]![1]]! += 1;
  return out;
};

export const HexAllocation = ({ slices, total }: { slices: readonly Slice[]; total: number }) => {
  const [hot, setHot] = useState<string | null>(null);
  const grid = useMemo(layout, []);
  const counts = useMemo(
    () =>
      apportion(
        slices.map((s) => s.value),
        FILLED,
      ),
    [slices],
  );

  let cursor = 0;
  const owner: number[] = [];
  counts.forEach((n, i) => {
    for (let k = 0; k < n; k++) owner[cursor++] = i;
  });
  const hotSlice = slices.find((s) => s.key === hot);

  return (
    <div>
      {/* The graph fills the design's 436 × 208 slot, centred. */}
      <div className="relative h-[208px]">
        <svg
          viewBox={`0 0 ${grid.width} ${grid.height}`}
          className="block h-full w-full"
          role="img"
          aria-label={`Allocation: ${slices
            .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
            .join(", ")}`}
          onPointerLeave={() => setHot(null)}
        >
          <defs>
            {SERIES.map((c, i) => (
              <linearGradient key={c} id={gradId(i)} x1="1" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={LIGHT(c)} />
                <stop offset="1" stopColor={DEEP(c)} />
              </linearGradient>
            ))}
          </defs>
          {grid.empty.map((c, i) => (
            <polygon key={`e${i}`} points={hex(c.x, c.y, R * 0.86)} fill="var(--color-page)" />
          ))}
          {grid.filled.map((c, i) => {
            const s = slices[owner[i] ?? 0];
            if (!s) return null;
            const dim = hot !== null && hot !== s.key;
            return (
              <polygon
                key={`f${i}`}
                points={hex(c.x, c.y, R * 0.86)}
                fill={`url(#${gradId(owner[i] ?? 0)})`}
                opacity={dim ? 0.3 : 1}
                strokeLinejoin="round"
                stroke={`url(#${gradId(owner[i] ?? 0)})`}
                strokeOpacity={dim ? 0.3 : 1}
                strokeWidth={1.5}
                style={{ transition: dim ? "opacity 300ms ease" : "opacity 0ms" }}
                onPointerEnter={() => setHot(s.key)}
              />
            );
          })}
        </svg>
        {hotSlice && (
          <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-lg bg-white px-3 py-2 whitespace-nowrap">
            <p className="text-[14px] leading-none font-medium text-ds-ink">{usd(hotSlice.value)}</p>
            <p className="mt-[6px] text-[12px] leading-none text-ds-muted">
              {hotSlice.label} · {Math.round((hotSlice.value / total) * 100)}%
            </p>
          </div>
        )}
      </div>

      {/*
        The legend, to allocation.svg: 36px rows; a 10px dot, the label in grey, the
        share from x 296, and today's move in dollars (the balance, for cash) at the right.
      */}
      <ul className="mt-[15px]" onPointerLeave={() => setHot(null)}>
        {slices.map((s, i) => {
          const pct = Math.round((s.value / total) * 100);
          const move = s.changePct === null ? null : s.value - s.value / (1 + s.changePct / 100);
          const dim = hot !== null && hot !== s.key;
          return (
            <li
              key={s.key}
              title={s.description}
              onPointerEnter={() => setHot(s.key)}
              className="grid h-9 grid-cols-[62.4%_minmax(0,1fr)_auto] items-center text-[14px] leading-none"
              style={{ opacity: dim ? 0.45 : 1, transition: dim ? "opacity 300ms ease" : "opacity 0ms" }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: dotFill(SERIES[i]!) }}
                  aria-hidden
                />
                <span className="truncate text-ds-muted">{s.label}</span>
              </span>
              <span className="font-medium text-ds-ink">{pct}%</span>
              <span className="flex items-center justify-end gap-1.5 font-medium text-ds-ink">
                {move !== null && <Move up={move >= 0} />}
                {move === null ? usd(s.value, 0) : usd(Math.abs(move))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** The 8 × 10 arrow from the design: green up, red down. */
const Move = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 10 12" width={10} height={12} fill="none" aria-label={up ? "up today" : "down today"}>
    <g
      stroke={up ? "var(--color-ds-up)" : "var(--color-ds-fall)"}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {up ? (
        <>
          <path d="M5.286 1.357V11" />
          <path d="M9.571 5.286C9.571 5.286 6.415 1 5.285 1C4.156 1 1 5.286 1 5.286" />
        </>
      ) : (
        <>
          <path d="M5.286 10.643L5.286 1" />
          <path d="M1 6.714C1 6.714 4.156 11 5.286 11C6.415 11 9.571 6.714 9.571 6.714" />
        </>
      )}
    </g>
  </svg>
);
