import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch, useHistories, useSignedIn, type Series, type Span, type StockPage } from "../api";

/** A basket as `GET /v1/baskets` returns it. The vault arrives once Symmetry has one. */
export interface Basket {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly feeBps: number;
  readonly depositFeeBps?: number;
  readonly withdrawFeeBps?: number;
  readonly minimumUsd: string;
  readonly capUsd: string | null;
  readonly venue: "symmetry";
  readonly constituents: readonly { readonly ticker: string; readonly weightBps: number }[];
  readonly vault?: {
    readonly address: string;
    readonly mint: string;
    readonly symbol: string;
    readonly creator: string;
    /** Unix seconds. The token started at `startPrice` then. */
    readonly createdAt: number;
    readonly startPrice: number;
  };
  readonly position?: { readonly tokens: number; readonly costUsd: number } | null;
}

export const useBaskets = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "baskets"],
    queryFn: async () => (await apiFetch<{ baskets: Basket[] }>("/v1/baskets")).baskets,
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
};

/** One stock in a basket: what it was set to, and what it has drifted to. */
export interface Leg {
  readonly ticker: string;
  readonly name: string | null;
  readonly logoUrl: string | null;
  /** 0–1. */
  readonly target: number;
  /** 0–1, or null until every price is in. Nothing rebalances, so this drifts. */
  readonly current: number | null;
}

/** A basket with its token's value worked out from the stocks it holds. */
export interface Valued {
  readonly basket: Basket;
  readonly legs: readonly Leg[];
  readonly nav: number | null;
  /** Percent over the range asked for. */
  readonly change: number | null;
  /** The token's value over the range, oldest first. */
  readonly series: number[] | null;
}

const price = (p: readonly [number, string]) => Number(p[1]);

/** The first reading on or after a moment, from a year of history. */
const priceAt = (s: Series | null | undefined, at: number) => {
  if (!s || s.points.length === 0) return null;
  const hit = s.points.find((p) => p[0] >= at) ?? s.points[s.points.length - 1]!;
  return price(hit);
};

/**
 * Every basket's value, from its stocks' own histories — the web's model, read
 * through our API instead of the upstreams. A vault holding its weights from a
 * start price is worth
 *
 *     start × Σ weight × price now / price when created
 *
 * and the weights drift with the prices, because nothing rebalances them. A
 * basket with no vault yet is valued from a year ago at $1.00, as the web does.
 */
export const useValued = (baskets: readonly Basket[] | undefined, span: Span) => {
  const tickers = useMemo(
    () => [...new Set((baskets ?? []).flatMap((b) => b.constituents.map((c) => c.ticker)))].sort(),
    [baskets],
  );
  const year = useHistories(tickers, "1Y");
  const range = useHistories(tickers, span);
  /* Names and logos, one stock page each. A basket holds a handful of stocks. */
  const pages = useQueries({
    queries: tickers.map((t) => ({
      queryKey: ["api", "instrument", t],
      queryFn: () => apiFetch<StockPage>(`/v1/instruments/${encodeURIComponent(t)}`),
      staleTime: 60_000,
    })),
  });
  const pageData = pages.map((p) => p.data);

  const valued = useMemo(() => {
    const info = new Map(
      pageData.filter((p) => p !== undefined).map((p) => [p.instrument.ticker, p.instrument]),
    );
    return (baskets ?? []).map((basket): Valued => {
      const created = basket.vault?.createdAt ?? Date.now() / 1000 - 365 * 86_400;
      const start = basket.vault?.startPrice ?? 1;
      const parts = basket.constituents.map((c) => {
        const line = range.data?.series[c.ticker]?.points ?? null;
        const now = line && line.length > 0 ? price(line[line.length - 1]!) : null;
        return { c, base: priceAt(year.data?.series[c.ticker], created), now, line };
      });
      const ready = parts.every((p) => p.base !== null && p.now !== null);
      const grown = ready ? parts.map((p) => (p.c.weightBps / 10_000) * (p.now! / p.base!)) : null;
      const total = grown?.reduce((s, g) => s + g, 0) ?? null;

      let series: number[] | null = null;
      if (ready && parts.every((p) => p.line && p.line.length > 1)) {
        const n = Math.min(...parts.map((p) => p.line!.length));
        series = Array.from(
          { length: n },
          (_, t) =>
            start *
            parts.reduce((s, p) => {
              const l = p.line!;
              return s + (p.c.weightBps / 10_000) * (price(l[l.length - n + t]!) / p.base!);
            }, 0),
        );
      }

      return {
        basket,
        legs: parts.map((p, k) => {
          const i = info.get(p.c.ticker);
          return {
            ticker: p.c.ticker,
            name: i?.name ?? null,
            logoUrl: i?.logoUrl ?? null,
            target: p.c.weightBps / 10_000,
            current: grown && total ? grown[k]! / total : null,
          };
        }),
        nav: total === null ? null : start * total,
        change: series && series.length > 1 ? (series[series.length - 1]! / series[0]! - 1) * 100 : null,
        series,
      };
    });
    // `pageData` is a fresh array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baskets, year.data, range.data, span, JSON.stringify(pageData.map((p) => p?.instrument.ticker))]);

  return { valued, loading: year.isPending || range.isPending };
};

/** "0.5%", "None". */
export const feeLabel = (bps: number | undefined) => (!bps ? "None" : `${Number((bps / 100).toFixed(2))}%`);
