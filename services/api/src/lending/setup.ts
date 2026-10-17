import type { ChainReader } from "@mercury/chain";
import { rentFor } from "../rent.js";

/**
 * What Kamino opens for a wallet's first loan, and what that costs in rent.
 *
 * Three accounts: the user's metadata, the obligation that holds the loan, and
 * the farm state that tracks the collateral's rewards. Kamino has no way to
 * close the first two, so their rent is spent for good rather than parked.
 *
 * Mercury pays it: the relayer tops the wallet up inside the loan's own
 * transaction, so an account is only ever opened for a loan that lands, and
 * the borrow sheet shows the cost struck through as covered. The sizes are
 * Kamino's (the tests hold them to the SDK's own layouts); the rate is the
 * node's.
 */
export const KAMINO_SETUP_BYTES = {
  obligation: 3_344,
  userMetadata: 1_032,
  farmState: 920,
} as const;

export const kaminoSetupRent = async (chain: Pick<ChainReader, "rentExemption">): Promise<bigint> => {
  const rents = await Promise.all(Object.values(KAMINO_SETUP_BYTES).map((bytes) => rentFor(chain, bytes)));
  return rents.reduce((sum, r) => sum + r, 0n);
};
