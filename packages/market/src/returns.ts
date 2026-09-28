import { D, type Decimal } from "@mercury/core";
import type { HistorySource, Series } from "./ports.js";

/**
 * The figures a returns table shows. Every one is nullable, because a provider
 * that has no history for a ticker must produce a blank row rather than a zero
 * — a zero reads as "it went nowhere", which is a claim we would not have made.
 */
export interface Returns {
  readonly m1: Decimal | null;
  readonly m6: Decimal | null;
  readonly y1: Decimal | null;
  /** Annualised, not cumulative: what a year of the last five averaged. */
  readonly cagr5y: Decimal | null;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * The compound annual rate across whatever the series actually spans.
 *
 * Measured from its own first and last timestamps rather than assumed to be
 * five years: a "5y" ask comes back as 262 weekly points, which is five years
 * and a fortnight, and dividing by a round 5 would quietly overstate it.
 */
export const cagrOf = (series: Series): Decimal | null => {
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  if (first === undefined || last === undefined || first.price.lte(0)) return null;

  const years = (last.at.getTime() - first.at.getTime()) / MS_PER_YEAR;
  // Under a season there is no annual rate worth stating; annualising a month
  // of noise produces a number that looks authoritative and means nothing.
  if (years < 0.25) return null;

  const growth = last.price.div(first.price);
  return D(growth.toNumber() ** (1 / years) - 1).mul(100);
};

/**
 * The four figures, fetched together.
 *
 * In parallel because they are four independent reads and a detail page waits
 * on the slowest, not the sum. Each span is cached by the adapter, so a popular
 * ticker costs these four calls once an hour however many people open it.
 */
export async function returnsFor(history: HistorySource, ticker: string): Promise<Returns> {
  const [m1, m6, y1, y5] = await Promise.all([
    history.seriesFor(ticker, "1M"),
    history.seriesFor(ticker, "6M"),
    history.seriesFor(ticker, "1Y"),
    history.seriesFor(ticker, "5Y"),
  ]);

  return {
    m1: m1?.changePct ?? null,
    m6: m6?.changePct ?? null,
    y1: y1?.changePct ?? null,
    cagr5y: y5 === null ? null : cagrOf(y5),
  };
}
