import { useId } from "react";

/** One line, drawn on mount. No axes, no grid, no crosshair. An investing app, not a terminal. */
export function Sparkline({ data, tone = "up", height = 110 }: {
  data: number[]; tone?: "up" | "down" | "muted"; height?: number;
}) {
  const id = useId();
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = 100 / (data.length - 1);

  const points = data.map((v, i) => [i * step, 100 - ((v - min) / span) * 100] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const stroke = tone === "up" ? "var(--color-up)" : tone === "down" ? "var(--color-down)" : "var(--color-muted)";

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height, width: "100%", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,100 L0,100 Z`} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 400, animation: "draw 1s cubic-bezier(.4,0,.2,1) forwards" }} />
    </svg>
  );
}
