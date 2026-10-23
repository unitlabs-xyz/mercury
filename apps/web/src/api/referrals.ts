import { useQuery } from "@tanstack/react-query";
import type { ReferralSummary } from "@mercury/types";
import { apiFetch } from "./client";
import { useSignedIn } from "./hooks";

/** The Invite panel's link and counts. Only read while the panel is open. */
export const useReferrals = (open: boolean) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "referrals"],
    queryFn: () => apiFetch<ReferralSummary>("/v1/referrals"),
    enabled: signedIn && open,
    staleTime: 60_000,
  });
};
