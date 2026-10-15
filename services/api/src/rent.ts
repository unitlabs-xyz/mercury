import type { ChainReader } from "@mercury/chain";

/**
 * Rent: what Solana makes an account hold to stay open, by its size.
 *
 * The relayer pays it whenever a sponsored transaction opens an account, and
 * it is most of what a first trade or a first loan costs us. The rate is asked
 * of the node, because the figure written down here went stale once without
 * anything noticing. What stays written down is the size of each account we
 * open: that is decided by the token, not by the rate.
 */

/** A wallet: a system account that holds no data. */
export const WALLET_BYTES = 0;

/** A classic SPL token account, which is what USDC's is. */
export const TOKEN_ACCOUNT_BYTES = 165;

/**
 * A stock's account: Token-2022, with the account extensions its mint requires.
 *
 * Measured on 15 October 2026 by opening one for a new wallet in simulation:
 * 179 bytes on xStocks (SPYx, NVDAx) and on Ondo (SPYon) alike. Accounts that
 * already exist can be larger — the fixtures hold one of 182 — but a new one
 * opens at this.
 */
export const STOCK_ACCOUNT_BYTES = 179;

/**
 * Mainnet's rate on 15 October 2026: 5,080 lamports a byte, counting the 128
 * bytes Solana adds to every account. Only for when the node cannot be asked.
 * It was 6,960 when the first constants here were set.
 */
export const measuredRent = (bytes: number): bigint => BigInt(128 + bytes) * 5_080n;

/**
 * Rent for an account of `bytes`: the node's figure when it gives one, and the
 * measured one when it cannot. A node that cannot say is no reason to refuse a
 * trade or a loan, and the measured rate is the best figure left.
 */
export const rentFor = (chain: Pick<ChainReader, "rentExemption">, bytes: number): Promise<bigint> =>
  chain.rentExemption === undefined
    ? Promise.resolve(measuredRent(bytes))
    : chain.rentExemption(bytes).catch(() => measuredRent(bytes));
