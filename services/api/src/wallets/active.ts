import { isNull } from "drizzle-orm";
import { wallets } from "../db/schema.js";

/**
 * The wallets Mercury follows: the Mercury wallet and every linked wallet that
 * has not been unlinked.
 *
 * What every job reads instead of "the primary wallet". An unlinked wallet is
 * not read, written, warned about or shown, though its rows are kept until the
 * person deletes them; this is the one condition that says so, so no job can
 * disagree with another about who is followed.
 */
export const followed = isNull(wallets.unlinkedAt);

/** Who a per-wallet row belongs to. Both, because every per-wallet table keeps the person beside the wallet. */
export interface WalletOwner {
  readonly userId: string;
  readonly walletId: string;
}
