import type { QueryClient } from "@tanstack/react-query";

/**
 * Refetch the account after a transaction lands, and again as the chain catches up.
 *
 * The server reads balances at the RPC's default commitment, finalized, which
 * trails a confirmed transaction by ten seconds or more. Refetching once, the
 * moment the order returns, reads the wallet as it was before it: the borrow
 * card still said "not held" after a buy until the page was reloaded. The
 * later passes pick the change up once it is final.
 */
export const refreshAfterChain = (qc: QueryClient) => {
  const go = () => void qc.invalidateQueries({ queryKey: ["api"] });
  go();
  for (const ms of [4_000, 12_000, 25_000]) setTimeout(go, ms);
};
