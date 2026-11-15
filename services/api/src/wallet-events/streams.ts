import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { walletStreams, wallets } from "../db/schema.js";
import type { WatchedAddress } from "../jobs/watch.js";

/**
 * Every address whose news belongs to somebody, and whose wallet that is.
 *
 * Two kinds of address, and both are needed. A wallet's own address is where
 * native SOL arrives and where the transaction that opens its USDC account
 * names it. Its token accounts are where every transfer after that one lands,
 * and those transactions do not name the wallet at all — an SPL transfer names
 * the two token accounts and the sender's authority, so watching the owner
 * alone would miss every deposit.
 *
 * The wallet's own address is included whether or not a pass has recorded a
 * stream for it yet, so a wallet created a moment ago is watched before its
 * first pass rather than after it.
 */
export const streamAddresses = async (db: Db): Promise<readonly WatchedAddress[]> => {
  const rows = await db
    .select({ wallet: wallets.address, stream: walletStreams.address })
    .from(wallets)
    .leftJoin(walletStreams, eq(walletStreams.walletId, wallets.id))
    .where(eq(wallets.isPrimary, true));

  const seen = new Set<string>();
  const watched: WatchedAddress[] = [];
  const add = (wallet: string, address: string) => {
    if (seen.has(address)) return;
    seen.add(address);
    watched.push({ wallet, address });
  };
  for (const row of rows) {
    add(row.wallet, row.wallet);
    if (row.stream !== null) add(row.wallet, row.stream);
  }
  return watched;
};
