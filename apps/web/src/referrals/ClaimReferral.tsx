import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiFetch } from "../api/client";
import { useSignedIn } from "../api/hooks";
import { clearRef, pendingRef, settles } from "./pending";

/**
 * Claims a waiting invite code as soon as someone is signed in. Renders
 * nothing. The server decides whether it counts; whatever the answer, the
 * code is spent, unless the request got no answer or only a transient one
 * (401, 408, 429).
 */
export const ClaimReferral = () => {
  const signedIn = useSignedIn();
  const qc = useQueryClient();
  const busy = useRef(false);

  useEffect(() => {
    const code = pendingRef();
    if (!signedIn || code === null || busy.current) return;
    busy.current = true;
    apiFetch<{ status: string }>("/v1/referrals/claim", { method: "POST", body: JSON.stringify({ code }) })
      .then(() => {
        clearRef();
        void qc.invalidateQueries({ queryKey: ["api", "referrals"] });
      })
      .catch((err: unknown) => {
        if (settles(err)) clearRef();
      })
      .finally(() => {
        busy.current = false;
      });
  }, [signedIn, qc]);

  return null;
};
