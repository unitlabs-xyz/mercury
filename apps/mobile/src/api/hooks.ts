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
