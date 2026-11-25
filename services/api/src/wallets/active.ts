import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
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

/** Several of one person's wallets, read together: one for a wallet's own page, every followed one for "All wallets". */
export interface WalletScope {
  readonly userId: string;
  readonly walletIds: readonly string[];
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Whether a wallet is still followed, read inside the transaction about to
 * write for it, with a share lock on its row. A job that read its list of
 * wallets before an unlink would otherwise go on writing for the wallet after
 * it, where nothing is meant to change. Unlinking updates the row, so it waits
 * for a write already holding this lock, and a write after it sees it gone.
 */
export const stillFollowed = async (tx: Tx, walletId: string): Promise<boolean> =>
  (
    await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.id, walletId), followed))
      .for("share")
  ).length > 0;

/** A wallet was unlinked while a job was writing for it: the write is dropped, and nothing is counted as failed. */
export class Unlinked extends Error {
  constructor() {
    super("the wallet was unlinked mid-pass");
    this.name = "Unlinked";
  }
}
