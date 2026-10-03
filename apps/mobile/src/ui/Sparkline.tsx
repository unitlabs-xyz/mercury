import { useMemo } from "react";
import Svg, { Circle } from "react-native-svg";
import { color } from "../theme";

/** Centre to centre. Small enough that the grid reads as texture, not as marks. */
const PITCH = 3.5;
const DOT = 0.85;

/**
 * The value at each of `n` evenly spaced columns, linearly interpolated, so any
 * series fits any width.
 */
export const resample = (values: readonly number[], n: number): number[] =>
  Array.from({ length: n }, (_, c) => {
    const t = n === 1 ? 0 : (c / (n - 1)) * (values.length - 1);
    const i = Math.floor(t);
    const a = values[i] ?? 0;
    const b = values[Math.min(values.length - 1, i + 1)] ?? a;
    return a + (b - a) * (t - i);
  });

/**
 * A price path at a glance, drawn in dots — the web's `app/Sparkline.tsx`,
 * algorithm for algorithm.
 *
 * A quiet grid with only the dots the line passes through lit. Each column
 * lights the rows between its point and halfway to the last one, so a steep
 * move still reads as one unbroken line rather than a column of specks. The
 * starting row stays a shade darker than the unlit grid, so above it is up and
 * below it is down without an axis having to say so.
 *
 * The grid is the design: a polyline would be smoother and would not be this
 * product.
 */
export const Sparkline = ({
  values,
  up,
  width = 64,
  height = 26,
}: {
  values: readonly number[] | null;
  /**
   * The direction to draw in, when the row already states one.
   *
   * Left out, the line takes its own: last reading against first. Beside a move
   * chip that number is a second opinion — the chip reads the live 24h move and
   * the series is the session, which are different windows and routinely
   * disagree, so a green chip sat next to a red line. The shape is the series;
   * the colour belongs to whatever figure the row is actually claiming.
   */
  up?: boolean;
  width?: number;
  height?: number;
}) => {
  const cols = Math.floor(width / PITCH);
  const rows = Math.floor(height / PITCH);
  const ready = values !== null && values.length > 1 && cols > 1 && rows > 1;

  const grid = useMemo(() => {
    if (!ready) return null;
    const pts = resample(values, cols);
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const span = hi - lo || 1;
    const rowOf = (v: number) => Math.round((1 - (v - lo) / span) * (rows - 1));
    const at = pts.map(rowOf);
    const base = rowOf(pts[0] ?? 0);
    const ownUp = (pts[pts.length - 1] ?? 0) >= (pts[0] ?? 0);

    // Centred in the box, whatever the pitch leaves over.
    const ox = (width - (cols - 1) * PITCH) / 2;
    const oy = (height - (rows - 1) * PITCH) / 2;

    const dots: { x: number; y: number; tone: "on" | "base" | "off" }[] = [];
    for (let c = 0; c < cols; c++) {
      const here = at[c] ?? 0;
      const prev = at[c - 1] ?? here;
      // Light from halfway to the previous point, so neighbouring columns meet
      // without doubling up.
      const mid = Math.round((prev + here) / 2);
      const from = Math.min(here, mid);
      const to = Math.max(here, mid);
      for (let r = 0; r < rows; r++) {
        dots.push({
          x: ox + c * PITCH,
          y: oy + r * PITCH,
          tone: r >= from && r <= to ? "on" : r === base ? "base" : "off",
        });
      }
    }
    return { dots, ownUp };
  }, [ready, values, cols, rows, width, height]);

  if (grid === null) return <Svg width={width} height={height} />;
  const on = (up ?? grid.ownUp) ? color.up : color.down;

  return (
    <Svg width={width} height={height}>
      {grid.dots.map((d, i) => (
        <Circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.tone === "on" ? DOT * 1.25 : DOT}
          fill={d.tone === "on" ? on : d.tone === "base" ? color.dash : color.hair}
        />
      ))}
    </Svg>
  );
};
