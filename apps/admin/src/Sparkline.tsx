import { useEffect, useRef, useState } from "react";

/** Centre to centre, in CSS pixels. Small enough that the grid reads as texture, not as marks. */
const PITCH = 3.5;
const DOT = 0.85;

/** The value at each of `n` evenly spaced columns, linearly interpolated, so any series fits any width. */
export const resample = (values: readonly number[], n: number) =>
  Array.from({ length: n }, (_, c) => {
    const t = n === 1 ? 0 : (c / (n - 1)) * (values.length - 1);
    const i = Math.floor(t);
    const a = values[i]!;
    const b = values[Math.min(values.length - 1, i + 1)]!;
    return a + (b - a) * (t - i);
  });

/**
 * A price path at a glance, drawn in dots: a quiet grid, and only the dots the
 * line passes through lit. Each column lights the rows between its point and
 * the last one, so a steep move still reads as one unbroken line. The start
 * row is a shade darker, so above it is up and below it is down. The grid is
 * sized from the element, so the dots stay round at any width.
 */
export const Sparkline = ({
  values,
  className = "",
}: {
  values: readonly number[] | null;
  className?: string;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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
  const ready = !!values && values.length > 1 && cols > 1 && rows > 1;

  let dots: { x: number; y: number; tone: "on" | "base" | "off" }[] = [];
  let up = true;
  if (ready) {
    const pts = resample(values, cols);
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const span = hi - lo || 1;
    const rowOf = (v: number) => Math.round((1 - (v - lo) / span) * (rows - 1));
    const at = pts.map(rowOf);
    const base = rowOf(pts[0]!);
    up = pts[pts.length - 1]! >= pts[0]!;
    // Grid offset so the dots sit centred in the box whatever is left over.
    const ox = (size.w - (cols - 1) * PITCH) / 2;
    const oy = (size.h - (rows - 1) * PITCH) / 2;
    dots = [];
    for (let c = 0; c < cols; c++) {
      const prev = at[c - 1] ?? at[c]!;
      // Light from halfway to the previous point, so neighbouring columns meet without doubling up.
      const from = Math.min(at[c]!, Math.round((prev + at[c]!) / 2));
      const to = Math.max(at[c]!, Math.round((prev + at[c]!) / 2));
      for (let r = 0; r < rows; r++) {
        dots.push({
          x: ox + c * PITCH,
          y: oy + r * PITCH,
          tone: r >= from && r <= to ? "on" : r === base ? "base" : "off",
        });
      }
    }
  }

  const on = up ? "var(--color-up)" : "var(--color-down)";

  return (
    <div ref={box} className={`block ${className}`} aria-hidden>
      {ready && (
        <svg width={size.w} height={size.h} className="block overflow-visible">
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.tone === "on" ? DOT * 1.25 : DOT}
              fill={d.tone === "on" ? on : d.tone === "base" ? "var(--color-dash)" : "var(--color-hair)"}
            />
          ))}
        </svg>
      )}
    </div>
  );
};
