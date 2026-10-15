import { CONNECTABLE_CHAIN_IDS, SOLANA_CHAIN_ID } from "./chains";

export type FunderVm = "evm" | "svm";

export interface Funder {
  readonly address: string;
  readonly vmType: FunderVm;
  /** Relay's chain id, which for an EVM chain is the EVM chain id itself. */
  readonly chainId: number;
}

/**
 * AppKit's namespace for a VM: the one place the two vocabularies meet.
 *
 * They are not two names for one thing. A namespace is a separate connection
 * with its own account, which is why "switch to Solana" is not something an
 * eip155 connection can be asked to do.
 */
export const namespaceOf = (vmType: FunderVm): "eip155" | "solana" =>
  vmType === "svm" ? "solana" : "eip155";

/** Which VM a Relay chain id belongs to. Every id we offer but one is EVM. */
export const vmOfChain = (chainId: number): FunderVm => (chainId === SOLANA_CHAIN_ID ? "svm" : "evm");

/** The wallets connected, one per namespace. Either may be absent. */
export interface Funders {
  readonly evm: Funder | null;
  readonly svm: Funder | null;
}

/**
 * Which connected wallet can sign on a chain, if any.
 *
 * The whole of the rule, in one place, because it was previously implied in
 * three: a hook that read whichever namespace was in front, a balance query
 * handed an address from the wrong one, and a button offering to switch a
 * chain across a boundary that chains do not cross.
 *
 * `null` means "none that can sign this", which is not "none connected" — an
 * Ethereum wallet is still connected when an SPL token asks for a Solana one,
 * and the caller must offer a second connection rather than a chain switch.
 */
export const funderForChain = (funders: Funders, chainId: number): Funder | null =>
  vmOfChain(chainId) === "svm" ? funders.svm : funders.evm;

/**
 * The connected wallet, read out of a CAIP address.
 *
 * AppKit reports the active account as `eip155:8453:0x…` or
 * `solana:<genesis>:<address>`, which carries the namespace and the chain in
 * one string — so this is the one place that has to know how those map to
 * Relay's ids, and it is a pure function rather than three branches spread
 * through a component.
 *
 * `null` for anything it does not recognise, which is deliberate. A wallet on
 * a chain this app has not declared cannot be switched to, cannot be quoted,
 * and must not be presented as connected: the deposit built for it would be
 * refused further down, where the reason is much harder to explain.
 */
export const funderFrom = (caipAddress: string | undefined): Funder | null => {
  if (caipAddress === undefined) return null;
  const [namespace, chain, ...rest] = caipAddress.split(":");
  const address = rest.join(":");
  if (namespace === undefined || chain === undefined || address.length === 0) return null;

  if (namespace === "eip155") {
    const chainId = Number(chain);
    if (!Number.isInteger(chainId) || !CONNECTABLE_CHAIN_IDS.has(chainId)) return null;
    return { address, vmType: "evm", chainId };
  }

  if (namespace === "solana") {
    /* Relay numbers Solana 792703809; AppKit identifies it by genesis hash.
       Nothing in that hash is worth checking — there is one Solana mainnet. */
    return { address, vmType: "svm", chainId: SOLANA_CHAIN_ID };
  }

  return null;
};
