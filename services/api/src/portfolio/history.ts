import { toWire, type Decimal } from "@mercury/core";

/** The ranges the chart offers. Longer ones wait for there to be data behind them. */
export type Range = "1D" | "1W" | "1M";

/** One row of `portfolio_snapshot`, as the series cares about it. */
export interface Reading {
  readonly at: Date;
  readonly totalUsd: Decimal;
}

/** One drawn point: when it was measured, and what the account was worth then. */
export interface SeriesPoint {
  readonly at: string;
  readonly valueUsd: string;
}

const HOUR = 3_600_000;

/**
 * How far back each range looks, and how wide a bucket is inside it.
 *
 * The bucket widths are chosen so every range draws a comparable number of
 * points — 24, 56, 60 — rather than 24, 168, 720. The dot chart draws a fixed
 * grid, so more points than it has dots is work thrown away, and a month of
 * hourly readings on the wire is 30x the payload for a line that looks the
 * same.
 */
export const RANGES: Record<Range, { readonly spanHours: number; readonly bucketHours: number }> = {
  "1D": { spanHours: 24, bucketHours: 1 },
  "1W": { spanHours: 24 * 7, bucketHours: 3 },
  "1M": { spanHours: 24 * 30, bucketHours: 12 },
};

/** A line needs two ends. One reading is a dot, and the empty state is more honest. */
export const MIN_POINTS = 2;

/** The top of the hour a moment belongs to, which is what a snapshot is keyed by. */
export const hourOf = (at: Date): Date => new Date(Math.floor(at.getTime() / HOUR) * HOUR);

/**
 * Readings into a drawable series.
 *
 * Each bucket closes on its most recent reading rather than averaging the ones
 * inside it: an average of a portfolio's value is a number the account was
 * never actually worth, and the whole point of this table is that every row
 * was true at the moment it was written.
 */
export const bucketSeries = (
  readings: readonly Reading[],
  range: Range,
  now: Date,
): readonly SeriesPoint[] => {
  const { spanHours, bucketHours } = RANGES[range];
  const from = now.getTime() - spanHours * HOUR;
  const width = bucketHours * HOUR;

  const latest = new Map<number, Reading>();
  for (const reading of readings) {
    const time = reading.at.getTime();
    if (time < from) continue;
    const bucket = Math.floor(time / width);
    const held = latest.get(bucket);
    if (held === undefined || reading.at.getTime() > held.at.getTime()) latest.set(bucket, reading);
  }

  return [...latest.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, reading]) => ({ at: reading.at.toISOString(), valueUsd: toWire(reading.totalUsd) }));
};
