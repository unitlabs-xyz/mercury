import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";
import { useSignedIn } from "./auth";

/**
 * The admin reads.
 *
 * Every one of these answers 404 for anybody not on the server's allowlist,
 * and 404 is also what an unconfigured deployment answers — the routes are not
 * mounted at all when `ADMIN_PRIVY_USER_IDS` is unset. So a 404 here is the
 * expected answer for almost every session, not a failure: it must not retry,
 * and it must not surface as an error anywhere a user would see it.
 *
 * None of these shapes are shared through `@mercury/types`, deliberately. They
 * are read by one page in one app, and putting them in the shared package
 * would publish the admin surface's response shapes to the mobile app and
 * anything else that imports it.
 */

export interface Freshness {
  readonly snapshotAt: string | null;
  readonly priceBarAt: string | null;
  readonly activityAt: string | null;
  readonly now: string;
}

export interface Overview {
  readonly users: number;
  readonly newUsers: readonly { day: string; count: number }[];
  readonly walletsByKind: readonly { kind: string; count: number }[];
  readonly funded: number;
  readonly traded: number;
  readonly aumUsd: string;
}

export interface OrderStats {
  readonly byDay: readonly {
    day: string;
    buys: number;
    sells: number;
    volumeUsd: string;
    feesUsd: string;
    revenueUsd: string;
    realisedPnlUsd: string;
  }[];
  readonly byStatus: readonly { status: string; count: number }[];
  readonly topTickers: readonly { ticker: string; count: number; volumeUsd: string }[];
}

export interface FundingStats {
  readonly byChain: readonly { chain: string; day: string; status: string; count: number }[];
  readonly settleSeconds: readonly { chain: string; p50: number }[];
  readonly failures: readonly { reason: string; count: number }[];
}

export interface BasketStats {
  readonly byKind: readonly { kind: string; count: number }[];
  readonly byState: readonly { state: string; count: number }[];
  readonly stuck: number;
}

/** A dashboard nobody is watching per second. Half a minute is plenty. */
const POLL = 30_000;

const notFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404;

/**
 * Never retry a 404.
 *
 * It is the answer for everybody who is not an admin, so retrying it would be
 * three requests per route per page load for every session that opens the
 * menu.
 */
const retry = (attempt: number, error: unknown) => !notFound(error) && attempt < 1;

const useRead = <T>(key: string, path: string, params: string, enabled: boolean) =>
  useQuery({
    queryKey: ["api", "admin", key, params],
    queryFn: () => apiFetch<T>(`/v1/admin/${path}${params}`),
    enabled,
    staleTime: POLL,
    refetchInterval: POLL,
    retry,
  });

/**
 * Whether this session may see the surface at all.
 *
 * Decided by the server answering 200 to the cheapest route there is, never by
 * a client-side flag anybody can set in a console. The menu entry is rendered
 * from this, so the worst a tampered client achieves is a link to a page whose
 * every request 404s.
 *
 * `granted` is false while the question is still open, so the entry appears
 * once rather than flickering in for everybody on first paint.
 */
export const useAdminAccess = (): { granted: boolean; checked: boolean } => {
  const signedIn = useSignedIn();
  const q = useQuery({
    queryKey: ["api", "admin", "access"],
    queryFn: () => apiFetch<Freshness>("/v1/admin/health"),
    enabled: signedIn,
    /* Asked once per session. Whether somebody is an admin does not change
       between two clicks of a menu. */
    staleTime: Infinity,
    retry,
  });

  return { granted: q.isSuccess, checked: q.isSuccess || q.isError };
};

/*
 * `useSignedIn()` is called before the `&&`, never inside it.
 *
 * `enabled && useSignedIn()` short-circuits the hook call when `enabled` is
 * false, so the hook order changes between renders — React's one rule, broken
 * in a way that only shows up once a caller passes a changing flag.
 */
export const useAdminHealth = (enabled = true) => {
  const signedIn = useSignedIn();
  return useRead<Freshness>("health", "health", "", enabled && signedIn);
};

export const useAdminOverview = (params: string, enabled = true) => {
  const signedIn = useSignedIn();
  return useRead<Overview>("overview", "overview", params, enabled && signedIn);
};

export const useAdminOrders = (params: string, enabled = true) => {
  const signedIn = useSignedIn();
  return useRead<OrderStats>("orders", "orders", params, enabled && signedIn);
};

export const useAdminFunding = (params: string, enabled = true) => {
  const signedIn = useSignedIn();
  return useRead<FundingStats>("funding", "funding", params, enabled && signedIn);
};

export const useAdminBaskets = (params: string, enabled = true) => {
  const signedIn = useSignedIn();
  return useRead<BasketStats>("baskets", "baskets", params, enabled && signedIn);
};
