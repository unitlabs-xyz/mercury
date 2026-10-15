import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "./client";

/** One row in the picker: a token, on a chain, with both their marks. */
export interface FundToken {
  readonly chainId: number;
  readonly chainName: string;
  readonly chainIconUrl: string | null;
  readonly vmType: string;
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoUrl: string | null;
  /**
   * Mercury's fee on depositing this token, as the server decides it: null for
   * Circle's USDC, or when no fee is set. Optional, because a server older than
   * the fee does not send it — and charges none.
   */
  readonly appFee?: { readonly recipient: string; readonly bps: number } | null;
}

/**
 * The typed query, held back until somebody stops typing.
 *
 * Every keystroke would otherwise be a request to us and a request from us to
 * Relay, and the answers would race: "us", "usd", "usdc" can come back in any
 * order, and the list would settle on whichever lost. 250ms is long enough to
 * cover a fast typist between letters and short enough that nobody waits.
 */
export const useDebounced = <T>(value: T, ms = 250): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return settled;
};

/**
 * Tokens to deposit, searched by the server.
 *
 * An empty query is a real query rather than a skipped one: the server asks
 * Relay for what is most held on each chain, which is the list to open on.
 *
 * Keeping the previous answer (`placeholderData`) is what stops the panel flickering between empty and full
 * on every search. The rows stay put and go slightly quiet while the next
 * answer is in flight, which reads as the same list being refined — because it
 * is — rather than as the list being destroyed and rebuilt.
 */
const fetchTokens = (query: string, chainId: number | null): Promise<{ tokens: readonly FundToken[] }> => {
  const params = new URLSearchParams();
  if (query.length > 0) params.set("q", query);
  if (chainId !== null) params.set("chainId", String(chainId));
  const qs = params.toString();
  return apiFetch(`/v1/money/fund/tokens${qs.length > 0 ? `?${qs}` : ""}`);
};

const tokensKey = (query: string, chainId: number | null) => ["fund-tokens", query, chainId] as const;

export const useFundTokens = (query: string, chainId: number | null) => {
  const client = useQueryClient();
  return useQuery<{ tokens: readonly FundToken[] }>({
    queryKey: tokensKey(query, chainId),
    /*
     * A chain's own list is asked for, not cut from the all-chains one: that
     * list is the fifty most held across every chain, so filtering it would
     * show a handful per chain and call it the lot. But the handful is right
     * as far as it goes, so it is shown at once while the full list arrives —
     * the chip answers immediately and the rest fills in under it.
     */
    placeholderData: (previous) => {
      if (chainId === null) return previous;
      const all = client.getQueryData<{ tokens: readonly FundToken[] }>(tokensKey(query, null));
      const mine = all?.tokens.filter((t) => t.chainId === chainId) ?? [];
      if (mine.length > 0) return { tokens: mine };
      /* A new search on the same chain keeps the rows it is refining, the
         way the all-chains list does; a different chain's rows never stand
         in for this one's. */
      return previous?.tokens.every((x) => x.chainId === chainId) === true ? previous : undefined;
    },
    /* The same search gives the same answer for a while; Relay's index does
       not move between keystrokes. */
    staleTime: 60_000,
    retry: false,
    queryFn: () => fetchTokens(query, chainId),
  });
};

/**
 * Start fetching a chain's list before it is asked for — on hover or focus of
 * its chip — so the click usually lands on an answer already in the cache.
 */
export const usePrefetchFundTokens = () => {
  const client = useQueryClient();
  return (query: string, chainId: number | null) =>
    void client.prefetchQuery({
      queryKey: tokensKey(query, chainId),
      queryFn: () => fetchTokens(query, chainId),
      staleTime: 60_000,
    });
};
