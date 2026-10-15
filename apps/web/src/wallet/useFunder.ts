import { useAppKit, useAppKitAccount, useAppKitNetwork, useDisconnect } from "@reown/appkit/react";
import { EVM_NETWORKS } from "./chains";
import { walletConnectConfigured } from "./appkit";
import { funderForChain, funderFrom, namespaceOf, type Funder, type Funders, type FunderVm } from "./funder";

/**
 * The wallets somebody has connected, one per namespace.
 *
 * Both of them, rather than "the active one". `useAppKitAccount()` with no
 * argument answers for whichever namespace is in front, and a wallet that has
 * approved both Ethereum and Solana holds two accounts at once — so asking the
 * bare hook while a Solana token was chosen handed back the 0x… address. What
 * that looked like: a balance read for an SPL mint against an Ethereum
 * address, reported as "Balance unavailable", under a button offering to
 * "Switch to Solana and send".
 *
 * Never Privy's. Privy is the account and its wallet is what receives; these
 * are wallets the user already holds, which sign one deposit and leave.
 */
export const useFunders = (): Funders => {
  /* Both hooks run on every render — hooks cannot be conditional — and each
     names its namespace rather than taking whatever is in front. */
  const evm = useAppKitAccount({ namespace: "eip155" });
  const svm = useAppKitAccount({ namespace: "solana" });
  /* An unconfigured app has no modal and therefore no account to report. */
  if (!walletConnectConfigured) return { evm: null, svm: null };
  return { evm: funderFrom(evm.caipAddress), svm: funderFrom(svm.caipAddress) };
};

/**
 * The wallet that can sign for this VM, or nothing.
 *
 * `null` here does not mean "no wallet connected". It means "no wallet that
 * can sign this", which the caller has to answer differently: within a
 * namespace the answer is to switch chains, across one it is to connect.
 */
export const useFunderForChain = (chainId: number): Funder | null => funderForChain(useFunders(), chainId);

/**
 * Any connected wallet, for the places that only ask whether somebody is here
 * at all — the picker, before a token has named a chain.
 */
export const useAnyFunder = (): Funder | null => {
  const { evm, svm } = useFunders();
  return evm ?? svm;
};

/**
 * Open the connect modal, on the wallets that can sign for a VM when one is
 * named.
 *
 * Naming it matters once two namespaces are in play: somebody who needs a
 * Solana wallet and is shown the full list, half of which cannot sign for the
 * token they picked, has been given a puzzle rather than a choice.
 *
 * A no-op when unconfigured rather than a throw: the callers that offer this
 * are already hidden in that case, and a button that explodes is a worse
 * failure than one that does nothing while somebody fixes the deployment.
 */
export const useConnectFunder = (): ((vmType?: FunderVm) => void) => {
  const { open } = useAppKit();
  return (vmType) => {
    if (!walletConnectConfigured) return;
    void open(vmType === undefined ? undefined : { view: "Connect", namespace: namespaceOf(vmType) });
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
 * Put the EVM wallet on the chain the chosen token lives on.
 *
 * EVM only, which is the whole of the name. Solana is not a chain an eip155
 * connection can be switched to — it is a separate namespace with its own
 * connection — and treating it as one more entry in the network list produced
 * a button reading "Switch to Solana and send" in front of an 0x… wallet,
 * which could never have worked: the switch is refused, and the wallet client
 * fetched after it belongs to a chain wagmi has never heard of. Across a
 * namespace the answer is `useConnectFunder`, not this.
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
    const target = EVM_NETWORKS.find((c) => c.id === chainId);
    if (target === undefined) return;
    /*
     * The same boundary cast `appkit.ts` makes, for the same reason: AppKit's
     * `CaipNetwork` declares `assets?: {…}` while its own network exports
     * carry `| undefined` on it, which this repo's `exactOptionalPropertyTypes`
     * refuses. Cast to their parameter type rather than `any`, and only on a
     * value that came from `EVM_NETWORKS` — a chain id we do not declare has
     * already been turned away above.
     */
    await switchNetwork(target as Parameters<typeof switchNetwork>[0]);
  };
};
