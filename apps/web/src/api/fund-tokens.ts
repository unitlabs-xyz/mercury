import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
 * `keepPreviousData` is what stops the panel flickering between empty and full
 * on every search. The rows stay put and go slightly quiet while the next
 * answer is in flight, which reads as the same list being refined — because it
 * is — rather than as the list being destroyed and rebuilt.
 */
export const useFundTokens = (query: string, chainId: number | null) =>
  useQuery<{ tokens: readonly FundToken[] }>({
    queryKey: ["fund-tokens", query, chainId],
    placeholderData: keepPreviousData,
    /* The same search gives the same answer for a while; Relay's index does
       not move between keystrokes. */
    staleTime: 60_000,
    retry: false,
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.length > 0) params.set("q", query);
      if (chainId !== null) params.set("chainId", String(chainId));
      const qs = params.toString();
      return apiFetch(`/v1/money/fund/tokens${qs.length > 0 ? `?${qs}` : ""}`);
    },
  });
