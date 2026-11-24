/**
 * A ring's geometry, apart from any one chart: where each share starts and
 * ends, and the SVG path for a piece of ring between two of those points.
 *
 * Fractions run 0 to 1 clockwise from twelve o'clock, so the first share
 * starts at the top as people expect a pie to.
 */

export interface Arc {
  readonly start: number;
  readonly end: number;
}

/**
 * Each value's piece of the ring, in order. Nothing below zero takes up any
 * of it (a wallet that owes more than it holds has no share of what is held),
 * and with nothing to share there is no ring at all.
 */
export const arcs = (values: readonly number[]): readonly Arc[] => {
  const sizes = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  let at = 0;
  return sizes.map((v) => {
    const start = at;
    at += v / total;
    return { start, end: at };
  });
};

const point = (cx: number, cy: number, r: number, fraction: number) => {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return `${round(cx + r * Math.cos(angle))} ${round(cy + r * Math.sin(angle))}`;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The piece of a ring between `inner` and `outer` radii from `start` to `end`.
 * A whole ring cannot be one arc (its two ends are the same point, which SVG
 * draws as nothing), so it is two circles, the inner one cut out with
 * `fill-rule="evenodd"`. An empty piece is an empty path.
 */
export const ringPath = (
  arc: Arc,
  { cx, cy, inner, outer }: { cx: number; cy: number; inner: number; outer: number },
): string => {
  const sweep = arc.end - arc.start;
  if (sweep <= 0) return "";
  if (sweep >= 1 - 1e-9) {
    const circle = (r: number) =>
      `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
    return `${circle(outer)} ${circle(inner)}`;
  }
  const large = sweep > 0.5 ? 1 : 0;
  return [
    `M ${point(cx, cy, outer, arc.start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(cx, cy, outer, arc.end)}`,
    `L ${point(cx, cy, inner, arc.end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(cx, cy, inner, arc.start)}`,
    "Z",
  ].join(" ");
};
