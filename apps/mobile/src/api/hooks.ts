import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/expo";
import type { Money, Portfolio } from "@mercury/types";
import type { ActivityItem } from "@mercury/view";
import { apiFetch } from "./client.js";

/**
 * How often an account read refreshes, and how long its answer counts as fresh.
 *
 * The web's `api/live.ts`, with its reasoning intact: portfolio, money and
 * activity share one policy, and the stale window equals the interval so a
 * remount cannot be served a cached answer while the timer refetches under it.
 *
 * `refetchOnWindowFocus` is the web's word for coming back to the tab. React
 * Native has no window; the equivalent is the app returning to the foreground,
 * which `app/_layout.tsx` wires into React Query's focus manager through
 * `AppState`. That is when these figures are most likely to have stopped being
 * true — somebody has just been somewhere else approving something.
 *
 * Thirty seconds, as on the web, and for the same reason: each poll of
 * portfolio and money reads the chain on the paid RPC (23 October 2026). The
 * app's own transactions still show at once, through `settle.ts`.
 */
export const LIVE = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
} as const;

/**
 * Everything here needs a session: `/v1/*` answers 401 without one, and that is
 * the right answer rather than something to work around. The queries stay
 * disabled until Privy says who is calling, so a signed-out person makes no
 * request at all instead of collecting failures.
 */
export const useSignedIn = (): boolean => {
  const { user, isReady } = usePrivy();
  return isReady && user !== null;
};

/** Holdings and cash, as the server last recorded them. A read writes nothing:
 *  the books are brought level with the chain by the background sync. */
export const usePortfolio = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "portfolio"],
    queryFn: () => apiFetch<Portfolio>("/v1/portfolio"),
    enabled: signedIn,
    ...LIVE,
  });
};

export const useMoney = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "money"],
    queryFn: () => apiFetch<Money>("/v1/money"),
    enabled: signedIn,
    ...LIVE,
  });
};

/** The feed. `limit` is small here: the home screen shows five of them. */
export const useActivityFeed = (limit = 25) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "activity", limit],
    queryFn: () =>
      apiFetch<{ items: ActivityItem[]; nextCursor: string | null }>(`/v1/activity?limit=${limit}`),
    enabled: signedIn,
    ...LIVE,
  });
};

/**
 * One instrument on the shelf, as `GET /v1/instruments` returns it.
 *
 * Market data reaches this app through our own API, where the web reads it
 * straight from the upstreams. That is a deliberate difference, not an
 * oversight: the web's direct path is ADR 0011's fallback — the thing that
 * still works when our API does not — and it exists because a browser can talk
 * to Jupiter and Pyth as cheaply as we can. Repeating it here would mean a
 * second copy of the pricing, anchoring and multiplier logic on a client that
 * ships through review, which is a worse trade than the dependency.
 */
export interface Instrument {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string | null;
  readonly logoUrl: string | null;
  readonly pricePerShare: string;
  readonly changePct24h: string;
  /** The exchange calendar: "open", "closed", "pre", "post". */
  readonly status: string;
  /** Pool deep enough for a normal order. The rest carry their own cap. */
  readonly featured: boolean;
  readonly maxOrderUsd: string;
  readonly holders: number;
}

export type Shelf = "featured" | "movers" | "popular";

/**
 * The shelf, or a search. Public: these routes answer without a session, so the
 * list fills before anyone signs in rather than after.
 *
 * Fifteen seconds, matching the server's own price cache — polling faster than
 * the thing being polled only costs round trips.
 */
export const useInstruments = (shelf: Shelf, query: string) => {
  const q = query.trim();
  return useQuery({
    queryKey: ["api", "instruments", shelf, q],
    queryFn: () =>
      apiFetch<{ instruments: Instrument[] }>(
        q.length > 0
          ? `/v1/instruments?q=${encodeURIComponent(q)}`
          : shelf === "featured"
            ? "/v1/instruments"
            : `/v1/instruments?shelf=${shelf}`,
      ),
    staleTime: 15_000,
    refetchInterval: 15_000,
    /* A search's previous answer stays on screen while the next one loads, so
       typing does not blank the list between keystrokes. */
    placeholderData: (prev) => prev,
  });
};

/** `[unix seconds, price]`, as the wire carries a point. */
export type HistoryPoint = readonly [number, string];

export interface Series {
  readonly changePct: string;
  readonly points: readonly HistoryPoint[];
}

/**
 * Sparklines for a shelf: one span across many tickers, in one round trip.
 *
 * A minute, where the list refreshes every fifteen seconds. A sparkline is
 * drawn to about fifty pixels wide; a point arriving sooner changes nothing a
 * reader could see.
 */
export const useHistories = (tickers: readonly string[], span = "1D") => {
  const key = [...tickers].sort().join(",");
  return useQuery({
    queryKey: ["api", "histories", span, key],
    queryFn: () =>
      apiFetch<{ span: string; series: Record<string, Series | null> }>(
        `/v1/instruments/history?tickers=${encodeURIComponent(key)}&span=${span}`,
      ),
    enabled: tickers.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
};

/** One wrapper token: the same stock, issued by someone. */
export interface Wrapper {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: "backed" | "ondo";
  readonly decimals: number;
  readonly multiplier: string;
  readonly isRoutable: boolean;
  readonly icon: string | null;
  readonly liquidityUsd: string;
  readonly holders: number;
  readonly volume24hUsd: string;
}

/**
 * Exactly these stocks, whatever shelf they are on: what someone owns or saved
 * is not always deep enough to be featured. Public, like the shelves.
 */
export const useInstrumentsByTicker = (tickers: readonly string[]) => {
  const key = [...tickers].sort().join(",");
  return useQuery({
    queryKey: ["api", "instruments", "tickers", key],
    queryFn: () =>
      apiFetch<{ instruments: Instrument[] }>(`/v1/instruments?tickers=${encodeURIComponent(key)}`),
    enabled: key.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
};

export interface InstrumentDetail extends Instrument {
  readonly description: string | null;
  readonly liquidityUsd: string;
  readonly volume24hUsd: string;
  readonly wrappers: readonly Wrapper[];
}

export interface StockPage {
  readonly instrument: InstrumentDetail;
  readonly buyers30d: number;
  readonly returns: { m1: string; m6: string; y1: string; cagr5y: string };
}

export const useInstrument = (ticker: string) =>
  useQuery({
    queryKey: ["api", "instrument", ticker],
    queryFn: () => apiFetch<StockPage>(`/v1/instruments/${encodeURIComponent(ticker)}`),
    enabled: ticker.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

/** The ranges a stock's chart offers, as `@mercury/market` defines them. */
export const SPANS = ["1D", "1W", "1M", "6M", "1Y", "5Y"] as const;
export type Span = (typeof SPANS)[number];

export const useInstrumentHistory = (ticker: string, span: Span) =>
  useQuery({
    queryKey: ["api", "instrument", ticker, "history", span],
    queryFn: () =>
      apiFetch<{ span: Span; changePct: string; points: readonly HistoryPoint[] }>(
        `/v1/instruments/${encodeURIComponent(ticker)}/history?span=${span}`,
      ),
    enabled: ticker.length > 0,
    staleTime: 60_000,
    /* The previous range stays drawn while the next loads, so switching ranges
       moves the line rather than blanking the card. */
    placeholderData: (prev) => prev,
  });

/** The exchange session, from `GET /v1/market/status`. */
export interface MarketStatus {
  readonly status: string;
  readonly isOpen: boolean;
  readonly nextOpenAt: string | null;
  readonly nextCloseAt: string | null;
  readonly isWeekend: boolean;
}

/** A minute: the line it feeds counts down in minutes, and re-reads the clock itself in between. */
export const useMarketStatus = () =>
  useQuery({
    queryKey: ["api", "market", "status"],
    queryFn: () => apiFetch<MarketStatus>("/v1/market/status"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

/** One company across every token of it you hold, as `GET /v1/portfolio/exposure/:ticker` returns it. */
export interface Exposure {
  readonly ticker: string;
  readonly shares: string;
  readonly valueUsd: string;
  readonly wrappers: readonly {
    readonly mint: string;
    readonly symbol: string;
    readonly issuer: "backed" | "ondo";
    readonly tokenQty: string;
    readonly multiplier: string;
    readonly shares: string;
    readonly valueUsd: string;
    /** Of this company's value, the share in this token, 0–100. */
    readonly sharePct: string;
  }[];
  readonly warnings: readonly {
    readonly code: string;
    readonly issuer: string;
    readonly sharePct: string;
    readonly message: string;
  }[];
}

/** Only asked for when something is held: the route answers 404 for a position of nothing. */
export const useExposure = (ticker: string, held: boolean) =>
  useQuery({
    queryKey: ["api", "exposure", ticker],
    queryFn: () => apiFetch<Exposure>(`/v1/portfolio/exposure/${encodeURIComponent(ticker)}`),
    enabled: held && ticker.length > 0,
    staleTime: 30_000,
  });
