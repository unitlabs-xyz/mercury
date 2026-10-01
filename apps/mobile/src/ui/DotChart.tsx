import { useMemo, useState } from "react";
import { StyleSheet, Text as RNText, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { usd } from "@mercury/view";
import { color, font } from "../theme";
import { resample } from "./Sparkline.js";

/** 4px dots on a 6px pitch: the web's matrix, at the density a phone can hold. */
const DOT = 2;
const PITCH = 6;
const ROWS = 24;

/**
 * A price over a range, drawn as a line of lit dots on a fixed matrix.
 *
 * The web's `app/DotChart.tsx`, carrying across the two rules that make it
 * read as a line rather than a column of specks:
 *
 *   - Each column lights its own reading and then climbs or drops towards the
 *     next, so a steep move has no gaps in it.
 *   - A column's colour is the way the line is heading there — green while it
 *     rises, red while it falls — and a flat step keeps the colour of the one
 *     before, so a level stretch never flickers.
 *
 * What the web has and this does not: the tooltip, the pinch-to-zoom between
 * ranges, and the animated glide when the range changes. Those are pointer
 * affordances or motion worth adding once the screen is otherwise finished;
 * the grid is what makes it ours.
 */
export const DotChart = ({ values, height = 200 }: { values: readonly number[] | null; height?: number }) => {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const cols = Math.floor(width / PITCH);
  const ready = values !== null && values.length > 1 && cols > 1;

  const grid = useMemo(() => {
    if (!ready) return null;
    const pts = resample(values, cols);
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    // A little room either side, so the line never sits on the edge; a dead
    // flat series would divide by zero and draws down the middle instead.
    const pad = (hi - lo || 1) * 0.06;
    const top = hi + pad;
    const span = top - (lo - pad);
    const rowOf = (v: number) => Math.min(ROWS - 1, Math.max(0, Math.round(((top - v) / span) * (ROWS - 1))));
    const at = pts.map(rowOf);

    // The direction at each column, as the web computes it.
    const rising: boolean[] = [];
    const steps = pts.map((v, i) => {
      const next = pts[i + 1] ?? v;
      const prev = pts[i - 1] ?? v;
      return i < pts.length - 1 ? next - v : v - prev;
    });
    let dir = (steps.find((d) => d !== 0) ?? 0) >= 0;
    for (const d of steps) {
      if (d !== 0) dir = d > 0;
      rising.push(dir);
    }

    const ox = (width - (cols - 1) * PITCH) / 2;
    const oy = (height - (ROWS - 1) * PITCH) / 2;

    const dots: { x: number; y: number; on: boolean; up: boolean }[] = [];
    for (let c = 0; c < cols; c++) {
      const here = at[c] ?? 0;
      const next = at[c + 1];
      const [from, to] =
        next === undefined || Math.abs(next - here) <= 1
          ? [here, here]
          : next > here
            ? [here, next - 1]
            : [next + 1, here];
      for (let r = 0; r < ROWS; r++) {
        dots.push({
          x: ox + c * PITCH,
          y: oy + r * PITCH,
          on: r >= from && r <= to,
          up: rising[c] ?? true,
        });
      }
    }
    return { dots, hi, lo };
  }, [ready, values, cols, width, height]);

  return (
    <View style={[s.box, { height }]} onLayout={onLayout}>
      {grid !== null && (
        <>
          <Svg width={width} height={height}>
            {grid.dots.map((d, i) => (
              <Circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={d.on ? DOT * 1.2 : DOT * 0.55}
                fill={d.on ? (d.up ? color.up : color.down) : color.hair}
              />
            ))}
          </Svg>
          {/* The range's own high and low, rather than an axis. Seven labelled
              ticks is the right answer on a 900px card and furniture on a
              phone: the two numbers that bound what is drawn are the two
              anybody reads off it. */}
          <RNText style={[s.edge, s.hi]}>{usd(grid.hi)}</RNText>
          <RNText style={[s.edge, s.lo]}>{usd(grid.lo)}</RNText>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  box: { width: "100%", justifyContent: "center" },
  edge: {
    position: "absolute",
    right: 0,
    fontFamily: font.medium,
    fontSize: 11,
    letterSpacing: -0.1,
    color: color.muted,
  },
  hi: { top: 0 },
  lo: { bottom: 0 },
});
