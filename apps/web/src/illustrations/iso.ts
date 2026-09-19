/**
 * Minimal isometric projection helpers. A true 2:1 dimetric projection:
 * x runs down-right, y runs down-left, z is straight up.
 */
const COS30 = 0.866;
const UNIT = 12;

export const iso = (x: number, y: number, z = 0): [number, number] => [
  (x - y) * COS30 * UNIT,
  ((x + y) * 0.5 - z) * UNIT,
];

const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

export type Faces = { top: string; left: string; right: string };

/** A box with its three visible faces, ready to hand to <polygon points>. */
export const slab = (x: number, y: number, w: number, d: number, h: number, z = 0): Faces => ({
  top: pts([iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]),
  right: pts([iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]),
  left: pts([iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]),
});

/** A flat plate: top face only, for things that read as cards rather than volumes. */
export const plate = (x: number, y: number, w: number, d: number, z: number) =>
  pts([iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)]);

export const line = (a: [number, number, number], b: [number, number, number]) => {
  const [x1, y1] = iso(...a);
  const [x2, y2] = iso(...b);
  return { x1, y1, x2, y2 };
};
