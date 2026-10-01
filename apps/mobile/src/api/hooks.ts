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
 */
export const LIVE = {
  staleTime: 10_000,
  refetchInterval: 10_000,
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
 * Where a loan stands. Only the fields this app reads are declared, as the web
 * does: `GET /v1/borrow` returns a great deal more, and typing all of it here
 * would be a second copy to keep in step for no gain.
 */
export interface Borrow {
  readonly debtUsd: number;
  readonly borrowableUsd: number;
  readonly overTargetUsd: number;
  readonly health: "healthy" | "over_limit" | "margin_call" | "liquidation";
  /** The fall that would reach liquidation, 0–1. Null when nothing is owed. */
  readonly safeUntilDrop: number | null;
}

/**
 * A minute, not ten seconds. This reads Kamino rather than our own books, and
 * the figure it answers with only moves when a price does or a loan is touched
 * — both of which already invalidate it.
 */
export const useBorrow = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "borrow"],
    queryFn: () => apiFetch<Borrow>("/v1/borrow"),
    enabled: signedIn,
    staleTime: 60_000,
    refetchInterval: 60_000,
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
