import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import type { MarketStatus, Money, Portfolio } from "@mercury/types";
import { SAMPLE_NO_LOGIN } from "../dev/sample";
import { apiFetch } from "./client";

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
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
};

export const useMoney = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "money"],
    queryFn: () => apiFetch<Money>("/v1/money"),
    enabled: signedIn,
    staleTime: 30_000,
    refetchInterval: 60_000,
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
}

export const useActivityFeed = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "activity"],
    queryFn: () => apiFetch<{ items: ActivityItem[]; nextCursor: string | null }>("/v1/activity?limit=100"),
    enabled: signedIn,
    staleTime: 30_000,
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

/**
 * Whether the API sends transactions or only simulates them (SEND_MODE). Public
 * and read once, so every screen can say "dry run" before anyone signs.
 */
export const useSendMode = () =>
  useQuery({
    queryKey: ["api", "send-mode"],
    queryFn: async () =>
      (await apiFetch<{ sendMode?: "broadcast" | "simulate" }>("/health")).sendMode ?? "broadcast",
    staleTime: Infinity,
  });
