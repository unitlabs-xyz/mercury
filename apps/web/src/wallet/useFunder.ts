import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { walletConnectConfigured } from "./appkit";
import { funderFrom, type Funder } from "./funder";

/**
 * The wallet somebody has connected to fund from, or nothing.
 *
 * Never Privy's. Privy is the account and its wallet is what receives; this is
 * a wallet the user already holds, which signs one deposit and leaves. The two
 * come from different connectors on purpose, so no code anywhere has to tell
 * them apart by inspecting them.
 */
export const useFunder = (): Funder | null => {
  const { caipAddress } = useAppKitAccount();
  /* The hook is always called — hooks cannot be conditional — but an
     unconfigured app has no modal and therefore no account to report. */
  return walletConnectConfigured ? funderFrom(caipAddress) : null;
};

/**
 * Open the connect modal.
 *
 * A no-op when unconfigured rather than a throw: the callers that offer this
 * are already hidden in that case, and a button that explodes is a worse
 * failure than one that does nothing while somebody fixes the deployment.
 */
export const useConnectFunder = (): (() => void) => {
  const { open } = useAppKit();
  return () => {
    if (!walletConnectConfigured) return;
    void open();
  };
};
