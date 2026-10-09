import type { QueryClient } from "@tanstack/react-query";

/**
 * When to look again, because the account becomes true in stages.
 *
 * Balances are right immediately: they are read at `confirmed`, which is what
 * sending waited for. So is any row a confirm call wrote — a fill, a basket
 * funding. What lags is a holding nobody reported, such as tokens arriving
 * from an in-kind exit: `position-sync` writes those from `finalized`.
 */
export const LATER_MS = [3_000, 15_000];

/**
 * Refetch the account after a transaction lands.
 *
 * Everything under `["api"]`, plus quotes — a quote is priced against the
 * wallet the transaction just changed. Deliberately a prefix rather than a
 * list of keys: invalidation refetches only what is mounted, so the breadth
 * costs what is on screen and nothing more, whereas a hand-kept list is what
 * left a basket withdrawal refreshing one query out of eight.
 */
export const refreshAfterChain = (qc: QueryClient) => {
  const go = () => {
    void qc.invalidateQueries({ queryKey: ["api"] });
    void qc.invalidateQueries({ queryKey: ["quote"] });
  };
  go();
  for (const ms of LATER_MS) setTimeout(go, ms);
};
