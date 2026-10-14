import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { FundChain } from "../app/money/fund-chain";

export type { FundChain } from "../app/money/fund-chain";

/**
 * The chains we take deposits from, for the filter row.
 *
 * Long-lived on purpose: it is the same answer for everybody, and it changes
 * when we deploy a new chain list rather than while somebody is choosing one.
 * The query failing is how the panel knows funding is not configured — the
 * routes are not mounted at all in that case.
 *
 * Tokens are not here. They come from useFundTokens, which searches.
 */
export const useFundSources = () =>
  useQuery<{ chains: readonly FundChain[]; minimumUsd: string }>({
    queryKey: ["fund-sources"],
    staleTime: 10 * 60_000,
    /* A 404 means the server has no Relay key. Retrying will not change that. */
    retry: false,
    queryFn: () => apiFetch("/v1/money/fund/sources"),
  });
