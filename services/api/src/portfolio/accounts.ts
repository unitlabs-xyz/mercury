import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { wallets } from "../db/schema.js";
import type { WatchedAddress } from "../jobs/watch.js";

/** What this needs of a chain reader: the accounts, not what is in them. */
export interface AccountSource {
  tokenAccounts(owner: string): Promise<readonly string[]>;
}

/** As the other per-wallet jobs: enough in flight to batch, few enough to keep connections. */
const CONCURRENCY = 8;

/**
 * Every token account worth watching, and whose it is.
 *
 * These are the addresses `accountSubscribe` is pointed at, and they are the
 * only way an incoming transfer is heard about: a transaction that moves
 * tokens names the two token accounts and the sender's authority, and never
 * the recipient, so a subscription on the wallet would never fire for money
 * arriving.
 *
 * A wallet that could not be read fails the whole list rather than being left
 * out of it. Left out, it is indistinguishable from a wallet that holds
 * nothing any more, and the watcher would let go of its subscriptions — one
 * refused read would stop somebody hearing about their own deposits.
 */
export async function tokenAccountAddresses(
  db: Db,
  source: AccountSource,
): Promise<readonly WatchedAddress[]> {
  const rows = await db.select({ address: wallets.address }).from(wallets).where(eq(wallets.isPrimary, true));

  // A shared index rather than a chunked split, so a slow wallet holds up only
  // itself, as `syncAllPositions` does.
  const found: WatchedAddress[][] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const row = rows[i];
      if (row === undefined) return;
      const accounts = await source.tokenAccounts(row.address);
      found[i] = accounts.map((address) => ({ wallet: row.address, address }));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return found.flat();
}
