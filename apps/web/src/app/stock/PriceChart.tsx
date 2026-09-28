import { useEffect, useMemo, useRef, useState } from "react";
import type { Span } from "../../market/hooks";
import { usd, usdSigned } from "../format";
import { resample } from "../Sparkline";

const PITCH = 6;
const DOT = 1.1;
const GUTTER = 64;

/** A 1-2-5 step that gives four to six ticks across the span. */
const niceStep = (span: number) => {
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
};

const AXIS: Record<Span, Intl.DateTimeFormatOptions> = {
  "1D": { hour: "numeric" },
  "1W": { weekday: "short", day: "numeric" },
  "1M": { day: "numeric", month: "short" },
  "6M": { day: "numeric", month: "short" },
  "1Y": { month: "short", year: "2-digit" },
  "5Y": { month: "short", year: "2-digit" },
};
const TIP: Record<Span, Intl.DateTimeFormatOptions> = {
  "1D": { weekday: "short", hour: "numeric", minute: "2-digit" },
  "1W": { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  "1M": { weekday: "short", day: "numeric", month: "short" },
  "6M": { day: "numeric", month: "short", year: "numeric" },
  "1Y": { day: "numeric", month: "short", year: "numeric" },
  "5Y": { month: "short", year: "numeric" },
};

/**
 * The stock's price over the range, in the same dot language as every other
 * chart: a quiet grid with only the line lit. Price on the y axis, time on the
 * x, the start price as the darker row. Hovering reads any moment: the price
 * then, when that was, and the move from the start of the range.
 */
export const PriceChart = ({
  values,
  times,
  range,
}: {
  values: readonly number[] | null;
  times: readonly Date[];
  range: Span;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hot, setHot] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.floor(size.w / PITCH);
  const rows = Math.floor(size.h / PITCH);

  const g = useMemo(() => {
    if (!values || values.length < 2 || cols < 2 || rows < 2) return null;
    const pts = resample(values, cols);
    const at = (i: number) => times[Math.round((i / (cols - 1)) * (times.length - 1))] ?? new Date();
    // Pad the scale a little so the line never sits on the frame.
    const rawLo = Math.min(...pts);
    const rawHi = Math.max(...pts);
    const pad = (rawHi - rawLo || rawHi * 0.01) * 0.12;
    const lo = rawLo - pad;
    const hi = rawHi + pad;
    const span = hi - lo;
    const rowOf = (v: number) => Math.round((1 - (v - lo) / span) * (rows - 1));
    const ox = (size.w - (cols - 1) * PITCH) / 2;
    const oy = (size.h - (rows - 1) * PITCH) / 2;
    const yOf = (v: number) => oy + (1 - (v - lo) / span) * (rows - 1) * PITCH;
    const lit = pts.map(rowOf);
    const base = rowOf(pts[0]!);
    const up = pts[pts.length - 1]! >= pts[0]!;

    const grid: { x: number; y: number; tone: "on" | "base" | "off" }[] = [];
    for (let c = 0; c < cols; c++) {
      const prev = lit[c - 1] ?? lit[c]!;
      const mid = Math.round((prev + lit[c]!) / 2);
      const from = Math.min(lit[c]!, mid);
      const to = Math.max(lit[c]!, mid);
      for (let r = 0; r < rows; r++) {
        grid.push({
          x: ox + c * PITCH,
          y: oy + r * PITCH,
          tone: r >= from && r <= to ? "on" : r === base ? "base" : "off",
        });
      }
    }

    const step = niceStep(rawHi - rawLo || rawHi * 0.02);
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (cols - 1)));
    return { pts, at, grid, ticks, yOf, xTicks, ox, oy, lit, up, step };
  }, [values, times, cols, rows, size.w, size.h]);

  const on = g?.up ? "var(--color-up)" : "var(--color-down)";
  const dots = useMemo(
    () =>
      g?.grid.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.tone === "on" ? DOT * 1.35 : DOT}
          fill={d.tone === "on" ? on : d.tone === "base" ? "var(--color-dash)" : "var(--color-hair)"}
        />
      )),
    [g, on],
  );

  const hotX = g && hot !== null ? g.ox + hot * PITCH : 0;
  const hotV = g && hot !== null ? g.pts[hot]! : null;
  const digits = g && g.step < 1 ? 2 : 0;

  return (
    // The tooltip and crosshair text follow the pointer, so no value flash here.
    <div data-no-flash className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <div
          aria-hidden
          className="relative shrink-0 text-right text-[11px] text-faint"
          style={{ width: GUTTER }}
        >
          {g?.ticks.map((t) => (
            <span key={t} className="absolute right-3 -translate-y-1/2" style={{ top: g.yOf(t) }}>
              {usd(t, digits)}
            </span>
          ))}
        </div>
        <div
          ref={box}
          className="relative min-w-0 flex-1 cursor-crosshair"
          role="img"
          aria-label={
            values && values.length > 1
              ? `Price over ${range}: from ${usd(values[0])} to ${usd(values[values.length - 1])}`
              : "Price chart"
          }
          onPointerMove={(e) => {
            if (!g) return;
            const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
            setHot(Math.max(0, Math.min(cols - 1, Math.round((x - g.ox) / PITCH))));
          }}
          onPointerLeave={() => setHot(null)}
        >
          {g && (
            <svg width={size.w} height={size.h} className="absolute inset-0 block overflow-visible">
              {g.ticks.map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={size.w}
                  y1={g.yOf(t)}
                  y2={g.yOf(t)}
                  stroke="var(--color-rule)"
                  strokeDasharray="2 4"
                />
              ))}
              {dots}
              {hot !== null && hotV !== null && (
                <>
                  <line x1={hotX} x2={hotX} y1={0} y2={size.h} stroke="var(--color-dash)" />
                  <circle cx={hotX} cy={g.yOf(hotV)} r={4} fill="white" stroke={on} strokeWidth={2} />
                </>
              )}
            </svg>
          )}
          {g && hot !== null && hotV !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-cardline bg-white px-2.5 py-1.5 whitespace-nowrap"
              style={{ left: Math.min(size.w - 70, Math.max(70, hotX)) }}
            >
              <p className="text-[13px] font-semibold">{usd(hotV)}</p>
              <p className="text-[11px] text-faint">
                {g.at(hot).toLocaleString("en-US", TIP[range])} ·{" "}
                <span className={hotV >= g.pts[0]! ? "text-up-deep" : "text-down-deep"}>
                  {usdSigned(hotV - g.pts[0]!)}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
      <div aria-hidden className="relative mt-2 h-4 text-[11px] text-faint" style={{ marginLeft: GUTTER }}>
        {g?.xTicks.map((c, k) => (
          <span
            key={c}
            className={`absolute whitespace-nowrap ${k === 0 ? "" : k === 4 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: k === 0 ? 0 : k === 4 ? "100%" : g.ox + c * PITCH }}
          >
            {g.at(c).toLocaleString("en-US", AXIS[range])}
          </span>
        ))}
      </div>
    </div>
  );
};
