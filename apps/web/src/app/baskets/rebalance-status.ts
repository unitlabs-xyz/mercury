import type { ManagedBasketOperation } from "@mercury/types";

export function rebalanceOutcome(
  state: ManagedBasketOperation["state"],
  error: string | null,
): { label: string; detail: string | null } {
  if (state === "failed" && /solana swap reconciliation timed out/i.test(error ?? ""))
    return {
      label: "Outcome unconfirmed",
      detail: "Glider could not confirm the swap in time. Check your current holdings before trying again.",
    };
  return { label: state.charAt(0).toUpperCase() + state.slice(1).replaceAll("_", " "), detail: error };
}

export const rebalanceTerminal = (state: ManagedBasketOperation["state"] | undefined) =>
  state === "completed" || state === "failed" || state === "cancelled";
