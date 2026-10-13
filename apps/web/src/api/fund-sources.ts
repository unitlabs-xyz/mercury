import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { anyInFlight, type FundCurrency, type FundSource } from "../app/money/fund-chain";

export type { FundCurrency, FundSource } from "../app/money/fund-chain";

/**
 * Every chain and token we can accept.
 *
 * Long-lived on purpose: it is the same answer for everybody, and it changes
 * when Relay adds a chain rather than while somebody is choosing one. The
 * query failing is how the panel knows funding is not configured — the routes
 * are not mounted at all in that case.
 */
export const useFundSources = () =>
  useQuery<{ chains: readonly FundSource[]; minimumUsd: string }>({
    queryKey: ["fund-sources"],
    staleTime: 10 * 60_000,
    /* A 404 means the server has no Relay key. Retrying will not change that. */
    retry: false,
    queryFn: () => apiFetch("/v1/money/fund/sources"),
  });

export interface FundIntent {
  readonly id: string;
  readonly status: string;
  readonly depositAddress: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  readonly quotedOutRaw: string | null;
  readonly inTxHash: string | null;
  readonly outTxHash: string | null;
  readonly failReason: string | null;
  readonly createdAt: string;
}

/**
 * The deposits this account has in flight.
 *
 * Polled while anything is still moving and idle once nothing is, because a
 * Bitcoin deposit sits in `pending` for up to an hour and an app showing
 * nothing is indistinguishable from money lost.
 */
export const useFundIntents = () =>
  useQuery<{ intents: readonly FundIntent[] }>({
    queryKey: ["fund-intents"],
    retry: false,
    queryFn: () => apiFetch("/v1/money/fund/intents"),
    refetchInterval: (query) =>
      anyInFlight((query.state.data?.intents ?? []).map((i) => i.status)) ? 15_000 : false,
  });

export interface FundAddress {
  readonly depositAddress: string;
  readonly requestId: string;
  readonly chain: { readonly id: number; readonly name: string; readonly vmType: string };
  readonly currency: FundCurrency;
  readonly minimumUsd: string;
  /** False on a chain we hold no refund key for. The panel has to say so. */
  readonly autoRefund: boolean;
}

export const useFundAddress = () => {
  const qc = useQueryClient();
  return useMutation<FundAddress, Error, { chainId: number; currency: string }>({
    mutationFn: (input) =>
      apiFetch<FundAddress>("/v1/money/fund/address", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    /* The intent exists the moment this resolves, so the list below is stale. */
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fund-intents"] }),
  });
};
