import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usd, usdSigned } from "@mercury/view";

/** One reading of the account's value: a display label and the value then. */
export type Point = { label: string; value: number };

/** Every dot is 6px on an 8px pitch, as in the dot-matrix design, whatever the range, so the grid never changes shape. */
const DOT = 6;
const PITCH = 8;
/** A sparkline's dots: a touch smaller, a 2px gap as on the full chart, so a short strip still reads as a line. */
export const SMALL = { dot: 4.5, pitch: 6.5 } as const;
/** A list row's sparkline: small enough for a 24px strip, still round dots with a gap. */
export const TINY = { dot: 3, pitch: 4 } as const;
/** About this many labelled steps up the y axis. */
const TICKS = 7;

/**
 * The narrowest the change axis is allowed to be, as a share of what the
 * account was worth at the start of the range.
 *
 * Without a floor the axis fits itself to whatever the data did, so an account
 * that moved a third of a cent gets an axis labelled in ten-thousandths and a
 * line that falls off a cliff. The move was 0.02%. Drawing it as a crash is the
 * chart lying about significance, and it is the reading a chart is worst at
 * defending against, because the shape is convincing and the labels are small.
 *
 * One percent, so this only ever binds when the move is too small to matter: a
 * portfolio that actually moved leaves the data wider than the floor and the
 * floor does nothing.
 */
const MIN_SPAN_PCT = 0.01;

/**
 * The change axis's bounds: the data's own range, never narrower than
 * `MIN_SPAN_PCT` of the opening value, with a little room either side so the
 * line never sits on the edge. Widened symmetrically, which leaves $0 near the
 * middle on a flat range rather than pinned to an edge.
 */
export const axisBounds = (
  changes: readonly number[],
  openingValue: number,
  floored: boolean,
): { hi: number; lo: number } => {
  const rawHi = Math.max(0, ...changes);
  const rawLo = Math.min(0, ...changes);
  const range = rawHi - rawLo;
  const floor = floored ? Math.abs(openingValue) * MIN_SPAN_PCT : 0;
  const short = Math.max(0, floor - range) / 2;
  const pad = (range || 1) * 0.04;
  return { hi: rawHi + pad + short, lo: rawLo - pad - short };
};

/** The 1-2-2.5-5 step whose tick count comes closest to `TICKS` across the span. */
const niceStep = (span: number) => {
  const mag = 10 ** Math.floor(Math.log10(span / TICKS || 1));
  const steps = [0.5, 1, 2, 2.5, 5, 10].map((f) => f * mag);
  return steps.reduce((best, s) => (Math.abs(span / s - TICKS) < Math.abs(span / best - TICKS) ? s : best));
};

/** Decimals a step needs so neighbouring ticks never read the same: 2.5 → 1, 0.25 → 2, 5 → 0. */
const digitsFor = (step: number) => {
  for (let d = 0; d < 4; d++) if (Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-6) return d;
  return 4;
};

/** An axis label: "+$2.5", "−$5", "$0"; whole dollars print without a trailing ".0". */
const tick = (n: number, step: number) =>
  n === 0
    ? "$0"
    : `${n < 0 ? "−" : "+"}${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: Math.abs(n) >= 10_000 ? "compact" : "standard",
        minimumFractionDigits: 0,
        maximumFractionDigits: digitsFor(step),
      }).format(Math.abs(n))}`;

/** A price label for a stock's axis: "$147", "$147.5", compact past $10k. */
const price = (n: number, step: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: n >= 10_000 ? "compact" : "standard",
    minimumFractionDigits: 0,
    maximumFractionDigits: digitsFor(step),
  }).format(n);

const percent = (n: number, digits = 2) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")}%`;

/** "Sat 19, 14:00" → "Sat 19": the axis names days; the tooltip has the hour. */
const day = (label: string) => label.split(",")[0] ?? label;

/** Dots gliding to a new line: a short ease with only a hint of overshoot, so a range switch settles rather than bounces. */
const MOVE = "420ms cubic-bezier(0.25, 1.08, 0.5, 1)";

/** Pinch travel before the range steps, and the pause before it can step again. */
const WHEEL_STEP = 40;
const ZOOM_PAUSE_MS = 450;

/** A radial sheen on the lit dots: a lighter highlight top right, deepening to the edge. */
const sheen = (c: string) =>
  `radial-gradient(circle at 70% 30%, color-mix(in oklab, ${c}, white 28%), ${c} 55%, color-mix(in oklab, ${c}, black 14%))`;

const COLOR = { up: "var(--color-up)", down: "var(--color-down)", off: "var(--color-page)" } as const;
const SHEEN = { up: sheen(COLOR.up), down: sheen(COLOR.down) } as const;

/**
 * Change since the start of the period, drawn as a line of lit dots on a fixed
 * dot matrix. On the change scale (the account) dots are green above $0 and red
 * below it; on the price scale (a stock) green where the line rises, red where
 * it falls.
 *
 * The grid is fixed by the box, not by the data: the same columns and rows of
 * the same dots for every range. Each range is sampled onto those columns, so
 * switching range never moves the matrix; the lit dots glide up and down
 * their columns to the new line.
 */
export const DotChart = ({
  series,
  label,
  axes = true,
  dot = DOT,
  pitch = PITCH,
  interactive = true,
  rest = COLOR.off,
  onZoom,
  scale = "change",
}: {
  series: readonly Point[];
  label: string;
  /** Off for a sparkline: the matrix alone, no scale beside or under it. */
  axes?: boolean;
  /** Dot size and spacing in px; the default is the full chart's 6 on 8. */
  dot?: number;
  pitch?: number;
  /** Off where the chart sits inside a row that is itself the link: no hover, no tooltip. */
  interactive?: boolean;
  /** The unlit dots' colour: page grey by default, darker where the chart sits on the grey list panel. */
  rest?: string;
  /**
   * Pinch on the chart to change its range: +1 zooms out (a longer range, more
   * time in the same box), -1 zooms in. A trackpad pinch or ctrl-scroll, a
   * Safari gesture, or two fingers on a touch screen. Without it, pinching
   * zooms the page as usual.
   */
  onZoom?: (dir: 1 | -1) => void;
  /**
   * What the y axis reads. "change": gain or loss since the start of the range,
   * from $0 (the account, where the question is "how much did I make").
   * "price": the price itself, on round price levels (a stock). Colour follows
   * the question: the change scale is green above $0 and red below; the price
   * scale is green where the line rises and red where it falls.
   * "percent": cumulative modeled return, with a percentage axis and tooltip.
   */
  scale?: "change" | "price" | "percent";
}) => {
  const [hot, setHot] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // The box's size; the grid is derived from it, so it always follows dot and pitch.
  // Unknown until measured, so the first paint never draws a grid sized for some other box.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Held in a ref so the listeners, added once, always call the latest handler.
  const zoomTo = useRef(onZoom);
  useEffect(() => {
    zoomTo.current = onZoom;
  }, [onZoom]);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    let last = 0;
    let wheel = 0;
    let span = 0;
    const step = (dir: 1 | -1) => {
      const now = performance.now();
      if (now - last < ZOOM_PAUSE_MS) return;
      last = now;
      zoomTo.current?.(dir);
    };
    // A trackpad pinch arrives as ctrl + wheel; spreading the fingers scrolls up.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !zoomTo.current) return;
      e.preventDefault();
      wheel += e.deltaY;
      if (Math.abs(wheel) >= WHEEL_STEP) {
        step(wheel > 0 ? 1 : -1);
        wheel = 0;
      }
    };
    // Safari reports a pinch as a gesture with a scale instead.
    type Gesture = Event & { scale: number };
    const onGesture = (e: Event) => {
      if (!zoomTo.current) return;
      e.preventDefault();
      const scale = (e as Gesture).scale;
      if (scale < 0.8) step(1);
      else if (scale > 1.25) step(-1);
    };
    const gap = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) span = gap(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !span || !zoomTo.current) return;
      e.preventDefault();
      const r = gap(e.touches) / span;
      if (r < 0.78 || r > 1.28) {
        step(r < 1 ? 1 : -1);
        span = gap(e.touches);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturechange", onGesture, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturechange", onGesture);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const ready = size !== null;
  const COLS = Math.max(8, Math.floor(((size?.w ?? 0) + pitch - dot) / pitch));
  const ROWS = Math.max(4, Math.floor(((size?.h ?? 0) + pitch - dot) / pitch));

  // One real reading per column, the first and last always kept. No values are invented.
  const cols = useMemo(() => {
    if (!series.length) return [];
    const start = series[0]!.value;
    return Array.from({ length: COLS }, (_, j) => {
      const p = series[Math.round((j * (series.length - 1)) / Math.max(1, COLS - 1))]!;
      return { ...p, change: p.value - start };
    });
  }, [series, COLS]);

  // Rows run from the highest change at the top to the lowest at the bottom, with a
  // little room either side so the line never sits on the edge.
  const { hi, lo } = axisBounds(
    cols.map((c) => c.change),
    series[0]?.value ?? 0,
    scale === "change",
  );
  const span = hi - lo;
  const rowOf = (v: number) => Math.min(ROWS - 1, Math.max(0, Math.round(((hi - v) / span) * (ROWS - 1))));
  const valueOfRow = (r: number) => hi - (r / (ROWS - 1)) * span;
  const rows = cols.map((c) => rowOf(c.change));
  const hotCol = hot === null ? null : cols[hot];

  // Each column's colour is the way the line is heading there: green while it
  // rises, red while it falls. A column's dots run towards the next reading, so
  // its direction is that step (the last column takes the step into it). A flat
  // step keeps the colour of the one before, so a level stretch never flickers.
  const rising: boolean[] = [];
  {
    const steps = cols.map((c, i) => {
      const next = cols[i + 1] ?? c;
      const prev = cols[i - 1] ?? c;
      return i < cols.length - 1 ? next.value - c.value : c.value - prev.value;
    });
    let dir = (steps.find((d) => d !== 0) ?? 0) >= 0;
    for (const d of steps) {
      if (d !== 0) dir = d > 0;
      rising.push(dir);
    }
  }

  // Each column lights its own reading, then climbs or drops towards the next one,
  // so the line is continuous: no gaps where it jumps, and no gap where it crosses zero.
  const lit = rows.map((r, i) => {
    const next = rows[i + 1];
    if (next === undefined || Math.abs(next - r) <= 1) return [r, r] as const;
    return (next > r ? [r, next - 1] : [next + 1, r]) as readonly [number, number];
  });

  // Every column keeps this many dots, so the same dots can move between ranges.
  // The pool only grows while the grid holds: once a dot exists it stays, parked
  // and hidden when unused, so a later range never mounts or unmounts dots mid-move.
  const need = Math.max(Math.ceil(ROWS / 3), ...lit.map(([f, t]) => t - f + 1));
  const gridKey = `${COLS}x${ROWS}`;
  const [pool, setPool] = useState({ grid: gridKey, n: need, born: need });
  let movers = pool.n;
  let born = pool.born;
  if (pool.grid !== gridKey) {
    // A new grid (first measure, a resize): the dots simply take their places.
    movers = born = need;
    setPool({ grid: gridKey, n: need, born: need });
  } else if (need > pool.n) {
    // More dots than the pool has: add them, but hold them hidden for one frame
    // so they fade in where they belong instead of popping into view.
    movers = need;
    setPool({ grid: gridKey, n: need, born: pool.n });
  }
  useEffect(() => {
    if (pool.born >= pool.n) return undefined;
    const id = requestAnimationFrame(() => setPool((p) => ({ ...p, born: p.n })));
    return () => cancelAnimationFrame(id);
  }, [pool]);

  /** A dot's row: its column's run from `from`, continued past the end, folded back at the edge. */
  const placeOf = (from: number, k: number) =>
    from + k < ROWS ? from + k : Math.max(0, from - (from + k - ROWS + 1));

  // The line as last drawn, so each dot knows where it was. Updated during render
  // (React's "previous value" pattern) whenever the line changes.
  const litKey = lit.map(([f, t]) => `${f}-${t}`).join(",");
  // A new grid (first measure, or a resize) is not a range change: the dots take
  // their places without travelling from a grid that no longer exists.
  const grid = `${COLS}x${ROWS}`;
  const [line, setLine] = useState({ key: litKey, grid, now: lit, before: lit });
  if (line.key !== litKey || line.grid !== grid)
    setLine({ key: litKey, grid, now: lit, before: line.grid === grid ? line.now : lit });
  // Once the move has settled, the line it came from no longer matters.
  useEffect(() => {
    const t = setTimeout(() => setLine((l) => (l.before === l.now ? l : { ...l, before: l.now })), 800);
    return () => clearTimeout(t);
  }, [line.key]);

  const yOf = (v: number) => ((((hi - v) / span) * (ROWS - 1) + 0.5) / ROWS) * 100;
  // Across the drawn axis, not the data's own range: where the floor has
  // widened the axis, labelling only the data would leave one tick on an
  // otherwise empty scale.
  const step = niceStep(span || 1);
  // Ticks are placed in change space; on a price scale they fall on round prices.
  const base = scale === "price" || scale === "percent" ? (series[0]?.value ?? 0) : 0;
  const ticks: number[] = [];
  for (let t = Math.ceil((lo + base) / step) * step; t <= hi + base + 1e-9; t += step)
    ticks.push(Math.round((t - base) * 1e6) / 1e6);
  const axisLabel = (t: number) =>
    scale === "price"
      ? price(t + base, step)
      : scale === "percent"
        ? percent(t + base, digitsFor(step))
        : tick(t, step);
  // The label column only ever widens: a narrower set of labels on another range
  // would widen the dot grid by a column, and a new grid re-places every dot
  // instead of letting them glide.
  const widestNow = ticks.map(axisLabel).reduce((w, l) => (l.length > w.length ? l : w), "");
  const [widest, setWidest] = useState(widestNow);
  // For its first moments on screen (data landing, the first measure) the chart
  // just shows its labels; only a change after that, like a range switch, fades.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLive(true), 900);
    return () => clearTimeout(t);
  }, []);
  if (widestNow.length > widest.length) setWidest(widestNow);
  /*
   * Five evenly spaced ticks, minus any whose label repeats the one before it.
   * The columns are a resampling of the readings, so when there are fewer
   * readings than ticks several columns carry the same label — two readings an
   * hour apart printed "03:30 PM, 03:30 PM, 04:30 PM, 04:30 PM, 04:30 PM"
   * across the axis. A gap says "no new hour here"; a repeat says nothing.
   */
  const xTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => Math.round(f * (COLS - 1)))
    .filter((i, k, all) => k === 0 || day(cols[i]?.label ?? "") !== day(cols[all[k - 1]!]?.label ?? ""));

  return (
    // Charts animate their own dots; their axis and tooltip text follow the pointer.
    <div
      data-no-flash
      className={
        axes
          ? "grid h-full w-full grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(200px,1fr)_auto] gap-x-2"
          : "grid h-full w-full"
      }
    >
      {/* The y labels sit in a column as wide as the widest of them, right-aligned to it. */}
      {axes && (
        <div aria-hidden className="relative text-right text-[12px] leading-none text-ds-muted">
          {[...new Set([widest, ...ticks.map(axisLabel)])].map((l) => (
            <span key={`w${l}`} className="invisible block h-0 overflow-hidden whitespace-nowrap">
              {l}
            </span>
          ))}
          {/* A label keeps its place while its value and row hold; otherwise the old
              one fades out where it was and the new one fades in where it belongs. */}
          <AnimatePresence initial={false}>
            {ticks.map((t) => {
              const top = yOf(t);
              return (
                <motion.span
                  key={`${axisLabel(t)}@${top.toFixed(1)}`}
                  initial={live ? { opacity: 0 } : false}
                  animate={{ opacity: 1, transition: { duration: 0.24, ease: "easeOut", delay: 0.14 } }}
                  exit={{ opacity: 0, transition: { duration: live ? 0.12 : 0, ease: "easeIn" } }}
                  className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                  style={{ top: `${top}%` }}
                >
                  {axisLabel(t)}
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      <div
        ref={box}
        className="relative grid min-w-0"
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          gridAutoFlow: "column",
        }}
        role="img"
        aria-label={
          scale === "percent"
            ? `Modeled return over ${label}: from ${percent(series[0]?.value ?? 0)} to ${percent(series[series.length - 1]?.value ?? 0)}`
            : `${scale === "price" ? "Price" : "Change in value"} over ${label}: from ${usd(series[0]?.value)} to ${usd(series[series.length - 1]?.value)}`
        }
        onPointerLeave={() => setHot(null)}
      >
        {/* The empty matrix: fixed, it never animates. */}
        {ready &&
          Array.from({ length: COLS * ROWS }, (_, k) => (
            <span key={k} aria-hidden className="grid place-items-center">
              <span className="block rounded-full" style={{ width: dot, height: dot, background: rest }} />
            </span>
          ))}

        {/*
          The line: each column owns the same set of lit dots across ranges. On a
          range change every dot glides up or down its column to its new row, and
          dots a column no longer needs fade out in place, and new ones fade in where they belong.
        */}
        {ready &&
          cols.flatMap((_, i) => {
            const [from, to] = lit[i]!;
            const [pFrom, pTo] = line.before[i] ?? lit[i]!;
            return Array.from({ length: movers }, (_, k) => {
              const used = from + k <= to;
              const wasUsed = pFrom + k <= pTo;
              // Every dot, shown or not, has a place: its column's run, continued past the
              // end for the spares. So on a range change every dot travels to a real row:
              // ones still needed land on the line, ones joining come up from where they
              // waited, and ones leaving travel with the rest and dissolve as they arrive.
              const r = placeOf(from, k);
              // A dot added to the pool this render waits one frame, hidden, before it joins.
              const fresh = k >= born;
              const shows = used && (!wasUsed || fresh);
              const leaves = !used && wasUsed;
              // An account's change: green above where the range began, red below it.
              // A stock's price: green where it rises, red where it falls.
              const up = scale === "price" || scale === "percent" ? (rising[i] ?? true) : valueOfRow(r) >= 0;
              return (
                <span
                  key={`m${i}-${k}`}
                  aria-hidden
                  className="pointer-events-none absolute rounded-full motion-reduce:transition-none"
                  style={{
                    width: dot,
                    height: dot,
                    left: `${((i + 0.5) / COLS) * 100}%`,
                    top: `${((r + 0.5) / ROWS) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    background: up ? SHEEN.up : SHEEN.down,
                    opacity: !used || fresh ? 0 : hot !== null && hot !== i ? 0.35 : 1,
                    transition: [
                      `top ${MOVE}`,
                      "background-color 120ms linear",
                      // Joining: it travels hidden and fades in as it arrives, so nothing is seen
                      // appearing and then dragging across. Leaving: the mirror, fading as it
                      // goes. The hovered column lights at once; the hover dim is gentle.
                      hot === i
                        ? "opacity 0ms"
                        : shows
                          ? "opacity 220ms ease 200ms"
                          : leaves
                            ? "opacity 200ms ease"
                            : "opacity 300ms ease",
                    ].join(", "),
                  }}
                />
              );
            });
          })}

        {/* One hit strip per column, so hovering reads the whole column. */}
        {ready &&
          interactive &&
          cols.map((_, i) => (
            <span
              key={`h${i}`}
              aria-hidden
              className="absolute inset-y-0"
              style={{ left: `${(i / COLS) * 100}%`, width: `${100 / COLS}%` }}
              onPointerEnter={() => setHot(i)}
            />
          ))}

        {hotCol &&
          hot !== null &&
          (() => {
            // Beside the hovered column, level with the top of its dots; on the side with more room.
            const x = ((hot + 0.5) / COLS) * 100;
            const y = Math.min(90, Math.max(10, yOf(hotCol.change)));
            const right = x < 50;
            return (
              <div
                className="pointer-events-none absolute z-10 rounded-lg bg-white px-3 py-2 whitespace-nowrap transition-[left,top] duration-200 ease-out"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: `translate(${right ? "12px" : "calc(-100% - 12px)"}, -50%)`,
                }}
              >
                <p className="text-[14px] leading-none font-medium text-ds-ink">
                  {scale === "percent" ? percent(hotCol.value) : usd(hotCol.value)}
                </p>
                <p className="mt-[6px] text-[12px] leading-none text-ds-muted">
                  {hotCol.label} ·{" "}
                  <span className={hotCol.change >= 0 ? "text-ds-up" : "text-ds-down"}>
                    {scale === "percent" ? percent(hotCol.change) : usdSigned(hotCol.change)}
                  </span>
                </p>
              </div>
            );
          })()}
      </div>
      {axes && <span aria-hidden />}
      {axes && (
        <div aria-hidden className="relative mt-[7px] h-3 text-[12px] leading-none text-ds-muted">
          {xTicks.map((i, k) => (
            <span
              key={k}
              className={`absolute whitespace-nowrap ${
                k === 0 ? "" : k === xTicks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
              }`}
              style={{
                left: `${k === 0 ? 0 : k === xTicks.length - 1 ? 100 : ((i + 0.5) / COLS) * 100}%`,
              }}
            >
              {day(cols[i]?.label ?? "")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
