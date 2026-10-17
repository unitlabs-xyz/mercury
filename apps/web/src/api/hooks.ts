import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import type { HistoryRange, MarketStatus, Money, Portfolio, PortfolioHistory } from "@mercury/types";
import type { ActivityReceipt } from "@mercury/view";
import { SAMPLE_NO_LOGIN } from "../dev/sample";
import { apiFetch } from "./client";
import { LIVE } from "./live";

/**
 * The app's reads from our own API.
 *
 * Everything here needs a session: `/v1/*` answers 401 without one, and that is
 * the right answer rather than something to work around. The queries stay
 * disabled until Privy says who is calling, so a signed-out visitor makes no
 * request at all instead of collecting failures.
 *
 * Market data does *not* come through here. It is read straight from the
 * upstreams in `../market/hooks`, which is the fallback path ADR 0011
 * describes — the one thing that still works when this API does not.
 *
 * All three account reads share one polling policy, in ./live.
 */

export const useSignedIn = (): boolean => {
  const { ready, authenticated } = usePrivy();
  // Dev-only sample data counts as signed in; always false in a build.
  return SAMPLE_NO_LOGIN || (ready && authenticated);
};

/** Holdings and cash, as the server last recorded them. A read writes nothing:
 * the books are brought level with the chain by the background sync. */
export const usePortfolio = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "portfolio"],
    queryFn: () => apiFetch<Portfolio>("/v1/portfolio"),
    enabled: signedIn,
    ...LIVE,
    retry: (attempt) => attempt < 1,
  });
};

/**
 * The account's recorded value over a range.
 *
 * A minute, not the ten seconds the other account reads use. This series gains
 * a point an hour — the snapshot job's cadence — so polling it at the rate of
 * the live balance would be three hundred and sixty requests an hour for one
 * new point. A minute is still well inside the hour it is waiting for.
 */
export const usePortfolioHistory = (range: HistoryRange) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "portfolio", "history", range],
    queryFn: () => apiFetch<PortfolioHistory>(`/v1/portfolio/history?range=${range}`),
    enabled: signedIn,
    staleTime: 60_000,
    refetchInterval: 60_000,
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

export interface ActivityItem {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly amountUsd: string | null;
  readonly txSignature: string | null;
  readonly mint: string | null;
  readonly logoUrl: string | null;
}

export const useActivityFeed = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "activity"],
    queryFn: () => apiFetch<{ items: ActivityItem[]; nextCursor: string | null }>("/v1/activity?limit=100"),
    enabled: signedIn,
    ...LIVE,
  });
};

/**
 * One feed row and the record behind it, fetched when the row is opened.
 *
 * Not polled: a receipt is about something that already happened, and the
 * only thing that changes it is a confirm arriving late, which the feed's own
 * polling will show first.
 */
export const useActivityReceipt = (id: string | null) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "activity", id],
    queryFn: () => apiFetch<ActivityReceipt>(`/v1/activity/${encodeURIComponent(id ?? "")}`),
    enabled: signedIn && id !== null,
    staleTime: 5 * 60_000,
    retry: (attempt) => attempt < 1,
  });
};

/** The exchange calendar, from the server rather than from Pyth directly. */
export const useMarketStatus = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "market-status"],
    queryFn: () => apiFetch<MarketStatus>("/v1/market/status"),
    enabled: signedIn,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
};
