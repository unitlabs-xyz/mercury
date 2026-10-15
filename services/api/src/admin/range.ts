/**
 * The window every admin query runs over, validated before it reaches SQL.
 *
 * Capped, because these are aggregates over the tables that serve live
 * traffic. A date range is the one parameter a person types by hand, and "all
 * time" typed into a URL is how an internal dashboard takes down the API that
 * people are trading on.
 *
 * Zod at the boundary, as everywhere else in this service: inside, the dates
 * are Dates and nothing has to be checked again.
 */
import { z } from "zod";

/** A year and a day, which covers "the last year" without inviting "forever". */
export const MAX_RANGE_DAYS = 366;

/** Thrown for anything a caller could have typed. The routes answer it 400. */
export class BadRange extends Error {}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");

export const rangeSchema = z.object({ from: day.optional(), to: day.optional() });

/**
 * A day as an instant, refusing anything that is not that day.
 *
 * The regex is a shape, not a calendar, and `new Date` does not fail on a date
 * that does not exist — it rolls over. Measured: "2026-13-01" and "2026-01-32"
 * answer an Invalid Date, but "2026-02-30" answers 2 March, and "2026-02-29"
 * answers 1 March because 2026 is not a leap year. A range typed as February
 * would quietly report March, and the figures on screen would not belong to
 * the dates printed above them.
 *
 * Comparing the parsed instant back against the text catches both kinds: a
 * rollover no longer renders as what was asked for.
 */
const midnight = (text: string): Date => {
  const at = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== text) {
    throw new BadRange(`${text} is not a date.`);
  }
  return at;
};

export interface Range {
  readonly from: Date;
  readonly to: Date;
  readonly days: number;
}

export const parseRange = (query: Readonly<Record<string, string | undefined>>): Range => {
  const parsed = rangeSchema.safeParse(query);
  if (!parsed.success) throw new BadRange("Dates must be YYYY-MM-DD.");
  const { from, to } = parsed.data;

  const end = to === undefined ? new Date() : midnight(to);
  const start = from === undefined ? new Date(end.getTime() - 30 * 86_400_000) : midnight(from);

  if (start >= end) throw new BadRange("The range runs backwards.");

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days > MAX_RANGE_DAYS) {
    throw new BadRange(`That range is longer than ${MAX_RANGE_DAYS} days.`);
  }

  return { from: start, to: end, days };
};
