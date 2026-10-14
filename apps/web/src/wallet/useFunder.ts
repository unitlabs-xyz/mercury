import { useAppKit, useAppKitAccount, useAppKitNetwork, useDisconnect } from "@reown/appkit/react";
import { solana } from "@reown/appkit/networks";
import { EVM_NETWORKS, SOLANA_CHAIN_ID } from "./chains";
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

/**
 * Let go of the connected wallet.
 *
 * Needed more than it looks. This connector holds on across reloads, so a
 * wallet connected once to make one deposit is still the wallet three weeks
 * later — and somebody who wants to fund from a different one has no way to
 * say so. AppKit's own modal offers it, but only after a connect button that
 * reads as "connect" to a person who is already connected.
 *
 * Each namespace by name, rather than one call with none.
 *
 * `disconnect()` with no argument looked like it did this — AppKit's own
 * account view calls it that way, and its client reads an absent namespace as
 * "all of them". It is not enough here. Two adapters are configured, wagmi and
 * Solana, and each keeps its own account state; the no-argument path tears
 * down the connections but leaves that state behind, so `useAppKitAccount()`,
 * which reports whichever namespace is active, went on naming a wallet. What
 * somebody saw was Disconnect replacing their wallet with a different one.
 *
 * Naming both and awaiting both is the version with no "whichever is active"
 * in it. `allSettled` because a namespace with nothing connected rejects, and
 * one rejecting must not leave the other attached.
 */
const NAMESPACES = ["eip155", "solana"] as const;

export const useDisconnectFunder = (): (() => Promise<void>) => {
  const { disconnect } = useDisconnect();
  return async () => {
    if (!walletConnectConfigured) return;
    await Promise.allSettled(NAMESPACES.map((namespace) => disconnect({ namespace })));
  };
};

/**
 * Put the wallet on the chain the chosen token lives on.
 *
 * Switches directly rather than opening AppKit's network picker. The picker
 * was the wrong shape for this: the panel has already named the one chain it
 * needs, so a list of nine to choose from is a question nobody asked — and
 * opened straight to that view it has no history behind it, so selecting a
 * network left it on screen with the switch already done.
 *
 * Resolved against the networks this app declares, which is also the check
 * that the chain is one AppKit was built with. An id that is not in the list
 * would otherwise reach the adapter as an unknown network.
 */
export const useSwitchFunderChain = (): ((chainId: number) => Promise<void>) => {
  const { switchNetwork } = useAppKitNetwork();
  return async (chainId) => {
    if (!walletConnectConfigured) return;
    const target = chainId === SOLANA_CHAIN_ID ? solana : EVM_NETWORKS.find((c) => c.id === chainId);
    if (target === undefined) return;
    /*
     * The same boundary cast `appkit.ts` makes, for the same reason: AppKit's
     * `CaipNetwork` declares `assets?: {…}` while its own `solana` export
     * carries `| undefined` on it, which this repo's `exactOptionalPropertyTypes`
     * refuses. Cast to their parameter type rather than `any`, and only on a
     * value that came from them or from `EVM_NETWORKS` — a chain id we do not
     * declare has already been turned away above.
     */
    await switchNetwork(target as Parameters<typeof switchNetwork>[0]);
  };
};
