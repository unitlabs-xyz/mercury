/**
 * Which chains we take deposits from.
 *
 * This list is the whole policy, and it is here rather than in the browser so
 * that adding or dropping a chain is a server deploy and not a frontend
 * release. Relay supports 61; we offer these.
 *
 * Two rules govern what may go in it:
 *
 * 1. Relay must report the chain under `/chains` with `depositEnabled`. A
 *    chain it does not solve is a row that fails after somebody picks it.
 * 2. The web app must be able to *sign* on it. That means an AppKit adapter
 *    and, for EVM, an entry in `apps/web/src/wallet/chains.ts`. Offering a
 *    chain no wallet here can sign is the same failure one step later, and at
 *    the worst moment — after the user has chosen. `chains.test.ts` holds the
 *    two files to each other so this cannot drift silently.
 *
 * Bitcoin is deliberately absent and is not an oversight: Relay answers a BTC
 * origin with a PSBT, nothing here signs one, and the address flow that could
 * have taken it was removed with the refunder. See docs/adr/0014-relay-funding.md.
 *
 * The order is the order the filter chips appear in, so it is editorial: the
 * chains people actually hold things on come first.
 */
export const SUPPORTED_CHAIN_IDS: readonly number[] = [
  792703809, // Solana
  8453, // Base
  1, // Ethereum
  42161, // Arbitrum
  10, // Optimism
  137, // Polygon
  56, // BNB Chain
  43114, // Avalanche
  130, // Unichain
];

const SUPPORTED = new Set(SUPPORTED_CHAIN_IDS);

export const isSupportedChain = (chainId: number): boolean => SUPPORTED.has(chainId);

/**
 * Where a chain sits in the chip row, for sorting a list that arrives in
 * Relay's order. Anything unlisted sorts last rather than throwing, because
 * this only decides presentation.
 */
export const chainRank = (chainId: number): number => {
  const at = SUPPORTED_CHAIN_IDS.indexOf(chainId);
  return at === -1 ? SUPPORTED_CHAIN_IDS.length : at;
};
