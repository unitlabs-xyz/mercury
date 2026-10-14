import { CONNECTABLE_CHAIN_IDS, SOLANA_CHAIN_ID } from "./chains";

export type FunderVm = "evm" | "svm";

export interface Funder {
  readonly address: string;
  readonly vmType: FunderVm;
  /** Relay's chain id, which for an EVM chain is the EVM chain id itself. */
  readonly chainId: number;
}

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
