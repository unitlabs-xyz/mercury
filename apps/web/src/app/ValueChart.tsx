import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SERIES, type Range } from "./data";

const W = 700;
const H = 200;
const PAD = 6;

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * A single line with a soft fill, and a crosshair that reports the value under
 * the pointer. Keyboard users get the same readout with the arrow keys.
 */
export const ValueChart = ({ range }: { range: Range }) => {
  const svg = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const { points, path, area, lo, hi } = useMemo(() => {
    const series = SERIES[range];
    const values = series.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const points = series.map((p, i) => ({
      ...p,
      x: PAD + (i / (series.length - 1)) * (W - PAD * 2),
      y: PAD + (1 - (p.value - lo) / span) * (H - PAD * 2),
    }));
    const d = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return { points, path: d, area: `${d} L${W - PAD},${H} L${PAD},${H} Z`, lo, hi };
  }, [range]);

  const nearest = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const b = points[best];
      if (p && b && Math.abs(p.x - x) < Math.abs(b.x - x)) best = i;
    }
    setActive(best);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    setActive((i) => {
      const next = (i ?? points.length - 1) + step;
      return Math.max(0, Math.min(points.length - 1, next));
    });
  };

  const hot = active === null ? null : points[active];
  const first = points[0];
  const last = points[points.length - 1];
  const delta = hot && first ? hot.value - first.value : 0;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          tabIndex={0}
          role="img"
          aria-label={`Portfolio value over ${range}, from ${usd(first?.value ?? 0)} to ${usd(
            last?.value ?? 0,
          )}. Use the arrow keys to read individual points.`}
          onPointerMove={(e: PointerEvent<SVGSVGElement>) => nearest(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block h-[196px] w-full touch-pan-y focus-visible:outline-none"
        >
          <defs>
            <linearGradient id="hbArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1A7F4B" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#1A7F4B" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={area} fill="url(#hbArea)" />
          <path
            d={path}
            fill="none"
            stroke="#1A7F4B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hot && (
            <g>
              <line
                x1={hot.x}
                y1={0}
                x2={hot.x}
                y2={H}
                stroke="#1B1A17"
                strokeWidth="1"
                strokeOpacity="0.18"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={hot.x} cy={hot.y} r="5" fill="#fff" />
              <circle
                cx={hot.x}
                cy={hot.y}
                r="5"
                fill="none"
                stroke="#1A7F4B"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {/* Read-out sits outside the SVG so its type is not stretched by preserveAspectRatio. */}
        {hot && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-cardline bg-white px-3 py-2 shadow-[0_6px_20px_rgba(27,26,23,0.12)]"
            style={{ left: `${(hot.x / W) * 100}%` }}
          >
            <p className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{usd(hot.value)}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] whitespace-nowrap text-faint">
              {hot.label}
              <span className={delta >= 0 ? "text-up-deep" : "text-down-deep"}>
                {delta >= 0 ? "+" : "−"}
                {usd(Math.abs(delta)).replace("$", "$")}
              </span>
            </p>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex justify-between text-[12px] text-faint">
        <span>{first?.label}</span>
        <span className="tabular-nums">
          {usd(lo)} – {usd(hi)}
        </span>
        <span>{last?.label}</span>
      </figcaption>
    </figure>
  );
};
