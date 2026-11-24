import { historyReading } from "@mercury/view";
import { useActingWallet } from "./acting-wallet";
import { usePortfolioSummary } from "./hooks";

/**
 * Whether the wallet shown is still having its past read, so a figure that
 * comes from it (a loan's interest, what Earn earned) says "Reading history…"
 * rather than nothing, or a zero it isn't. Asked only once a wallet is linked:
 * with the Mercury wallet alone there is no history to wait for.
 */
export const useHistoryReading = (): boolean => {
  const { acting, linked } = useActingWallet();
  const summary = usePortfolioSummary(linked.length > 0);
  return historyReading(
    summary.data?.wallets,
    acting.kind === "linked" ? { kind: "linked", walletId: acting.wallet.id } : { kind: acting.kind },
  );
};
