import { useMemo } from "react";
import type { Basket } from "../../api/baskets";
import { useHistories, useInstruments, type History, type Instrument, type Span } from "../../market/hooks";

/** One stock in a basket, valued: what it was set to, and what it has drifted to. */
export type Leg = {
  readonly ticker: string;
  readonly instrument: Instrument | null;
  /** 0–1. */
  readonly target: number;
  /** 0–1, or null until every price is in. Version one does not rebalance, so this drifts. */
  readonly current: number | null;
  readonly fair: number | null;
  readonly todayPct: number | null;
};

/** A basket with its token's value worked out from the stocks it holds. */
export type Valued = {
  readonly basket: Basket;
  readonly legs: readonly Leg[];
  /** The basket token's value now, or null while histories load. */
  readonly nav: number | null;
  /** Percent, over the range asked for (today's move for 1D). */
  readonly change: number | null;
  readonly todayPct: number | null;
  /** The token's value over the range, oldest first. */
  readonly series: number[] | null;
  /** Percent since the token started at $1.00. */
  readonly sinceStart: number | null;
};

/** The first reading on or after the moment the vault was created. */
const priceAt = (h: History | null | undefined, at: number) => {
  if (!h || h.points.length === 0) return null;
  const hit = h.points.find((p) => p.at.getTime() >= at * 1000) ?? h.points[h.points.length - 1]!;
  return hit.price;
};

/**
 * Every basket's value, from its stocks' own histories. Symmetry prices a
 * vault token as the value of what it holds over its supply; a vault that
 * holds its target weights from a $1.00 start is worth
 *
 *     start × Σ weight × price now / price when created
 *
 * which is what this draws. The weights then drift with the prices, because
 * nothing rebalances them (docs/10), so the current weights come out of the
 * same sum.
 */
export const useValued = (baskets: readonly Basket[] | undefined, span: Span) => {
  const tickers = useMemo(
    () => [...new Set((baskets ?? []).flatMap((b) => b.constituents.map((c) => c.ticker)))].sort(),
    [baskets],
  );
  const instruments = useInstruments(tickers);
  // The year back reaches every vault's creation; the range is what is drawn.
  const year = useHistories(tickers, "1Y");
  const range = useHistories(tickers, span);

  const valued = useMemo(() => {
    const by = new Map((instruments.data ?? []).map((i) => [i.ticker, i]));
    return (baskets ?? []).map((basket): Valued => {
      const created = basket.vault?.createdAt ?? Date.now() / 1000 - 365 * 86_400;
      const start = basket.vault?.startPrice ?? 1;
      const parts = basket.constituents.map((c) => {
        const i = by.get(c.ticker) ?? null;
        const base = priceAt(year.data?.get(c.ticker), created);
        const fair = i?.quote.fair ?? null;
        return { c, i, base, fair: fair && fair > 0 ? fair : null, today: i?.quote.todayPct ?? null };
      });
      const ready = parts.every((p) => p.base !== null && p.fair !== null);
      // Each leg's share of the token's value now: weight × growth since creation.
      const grown = ready ? parts.map((p) => (p.c.weightBps / 10_000) * (p.fair! / p.base!)) : null;
      const total = grown?.reduce((s, g) => s + g, 0) ?? null;
      const nav = total === null ? null : start * total;

      const legs: Leg[] = parts.map((p, k) => ({
        ticker: p.c.ticker,
        instrument: p.i,
        target: p.c.weightBps / 10_000,
        current: grown && total ? grown[k]! / total : null,
        fair: p.fair,
        todayPct: p.today,
      }));

      // The day's move is each stock's, in the proportion the basket holds it now.
      const todayPct =
        grown && total && parts.every((p) => p.today !== null)
          ? parts.reduce((s, p, k) => s + (grown[k]! / total) * p.today!, 0)
          : null;

      // Histories of one span share their clock, but not always their length:
      // line them up from the latest reading back.
      const lines = parts.map((p) => range.data?.get(p.c.ticker)?.points ?? null);
      let series: number[] | null = null;
      if (ready && lines.every((l) => l && l.length > 1)) {
        const n = Math.min(...lines.map((l) => l!.length));
        series = Array.from({ length: n }, (_, t) =>
          parts.reduce((s, p, k) => {
            const line = lines[k]!;
            return s + (p.c.weightBps / 10_000) * (line[line.length - n + t]!.price / p.base!);
          }, 0),
        ).map((v) => v * start);
      }
      const change =
        span === "1D"
          ? todayPct
          : series && series.length > 1
            ? (series[series.length - 1]! / series[0]! - 1) * 100
            : null;

      return {
        basket,
        legs,
        nav,
        change,
        todayPct,
        series,
        sinceStart: nav === null ? null : (nav / start - 1) * 100,
      };
    });
  }, [baskets, instruments.data, year.data, range.data, span]);

  return {
    valued,
    loading: instruments.isLoading || year.isLoading,
    fetching: instruments.isFetching || range.isFetching,
    at: instruments.dataUpdatedAt,
  };
};

/** "7xQm…Rk9": an address short enough for a fact. */
export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** "29 Apr 2026". */
export const created = (at: number) =>
  new Date(at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
