import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

/**
 * "Set cost": what the person paid per share for one holding, in the chosen
 * wallet, in place of the estimated cost. Mercury's records only, so it
 * works for a linked wallet as for the Mercury wallet; the chosen wallet
 * rides on the request as every read's does.
 *
 * The position is worked out again from its lots on position-sync's next
 * pass, seconds while the app is open, so the holding and the summary are
 * read again then rather than at once.
 */
export const useSetCost = (ticker: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (unitCostUsd: string) =>
      apiFetch<{ lots: number }>(`/v1/portfolio/holdings/${encodeURIComponent(ticker)}/cost`, {
        method: "POST",
        body: JSON.stringify({ unitCostUsd }),
      }),
    onSuccess: () => {
      const refresh = () =>
        void qc.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === "api" && (q.queryKey[1] === "portfolio" || q.queryKey[1] === "summary"),
        });
      refresh();
      // Once more after position-sync has had its pass, so the new figure shows without a reload.
      setTimeout(refresh, 15_000);
    },
  });
};
