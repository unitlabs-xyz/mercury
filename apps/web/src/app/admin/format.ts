import { shortDate } from "../portfolio/ui";

/**
 * The pure bits of the admin page, kept out of the components so they can be
 * tested without rendering anything.
 *
 * Money formatting is `usd` and `usdCompact` from `@mercury/view`, the same
 * ones the product uses. A dashboard that rounds differently from the pages it
 * describes is a dashboard that starts arguments about which figure is right.
 */

/** Minutes between two instants, for the row-age readings on the health panel. */
export const minutesBetween = (then: string | null, now: string): number | null => {
  if (then === null) return null;
  const ms = new Date(now).getTime() - new Date(then).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 60_000);
};

/**
 * How old a reading is, in words.
 *
 * "Never" and "a minute ago" are different facts and read differently: a fresh
 * deployment has never taken a snapshot, which is not the same as one whose
 * job has stopped.
 */
export const age = (minutes: number | null): string => {
  if (minutes === null) return "never";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

/**
 * The snapshot job runs hourly, so ninety minutes is the point at which a
 * missed run has definitely happened rather than possibly being in flight.
 *
 * `portfolio_snapshot` is the only record of what an account used to be worth
 * and nothing can reconstruct a reading that was never taken, which is why
 * this one gets a threshold and the others do not.
 */
export const SNAPSHOT_STALE_MINUTES = 90;

export const snapshotStale = (minutes: number | null): boolean =>
  minutes === null || minutes > SNAPSHOT_STALE_MINUTES;

/**
 * A share, as a percentage string.
 *
 * Zero of zero is "—" rather than "0%": no signups yet is not a conversion
 * rate of nothing, and a dashboard that says 0% on its first day reads as a
 * problem rather than as an empty database.
 */
export const share = (part: number, whole: number): string =>
  whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;

/**
 * A day label for an axis.
 *
 * `shortDate` from the dashboard's own helpers rather than a second date
 * formatter — the same reason money goes through `usd`. It falls back to the
 * raw value rather than rendering "Invalid Date" into an axis.
 */
export const dayLabel = (day: string): string =>
  Number.isNaN(new Date(`${day}T12:00:00Z`).getTime()) ? day : shortDate(day);

/**
 * A grouped time series, flattened into one line per group over the same days.
 *
 * The chain-trend panel is the question this surface was asked for, and what
 * the API returns is one row per chain, day and status. Drawing it means a
 * value per chain at every day in the range, including the days a chain saw
 * nothing — a series that skipped those would slope between two points a week
 * apart and read as steady traffic.
 */
export const seriesByGroup = <T>(
  rows: readonly T[],
  group: (row: T) => string,
  day: (row: T) => string,
  value: (row: T) => number,
): {
  days: readonly string[];
  groups: readonly { name: string; values: readonly number[]; total: number }[];
} => {
  const days = [...new Set(rows.map(day))].sort();
  const names = [...new Set(rows.map(group))];

  const groups = names
    .map((name) => {
      const own = rows.filter((row) => group(row) === name);
      const values = days.map((d) =>
        own.filter((row) => day(row) === d).reduce((sum, row) => sum + value(row), 0),
      );
      return { name, values, total: values.reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.total - a.total);

  return { days, groups };
};
