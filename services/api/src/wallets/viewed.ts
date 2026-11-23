import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { wallets } from "../db/schema.js";
import { followed } from "./active.js";

/** `last_viewed_at` moves at most this often. The tiers it feeds are measured in days. */
export const VIEWED_EVERY_MS = 60 * 60_000;

/**
 * Records that someone looked at a linked wallet, at most once an hour.
 *
 * Presence is reported every few seconds by every open tab, and writing a row
 * for each would be a database write per viewer every few seconds for a figure
 * read in days. So an hour is remembered here, and the update itself only
 * touches a row whose last viewing is older than that, which also holds when
 * several API processes each remember their own hour.
 *
 * Only a followed linked wallet: the Mercury wallet's cadence does not depend
 * on it, and an unlinked wallet is not followed at all.
 */
export const viewedRecorder = (db: Db, opts: { readonly now?: () => Date } = {}) => {
  const now = opts.now ?? (() => new Date());
  const written = new Map<string, number>();
  return async (address: string): Promise<void> => {
    const at = now();
    const last = written.get(address);
    if (last !== undefined && at.getTime() - last < VIEWED_EVERY_MS) return;
    written.set(address, at.getTime());
    // Bounded by who has been looked at lately, not by everyone who ever was.
    if (written.size > 1_000) {
      for (const [a, t] of written) if (at.getTime() - t >= VIEWED_EVERY_MS) written.delete(a);
    }
    await db
      .update(wallets)
      .set({ lastViewedAt: at })
      .where(
        and(
          eq(wallets.address, address),
          eq(wallets.kind, "external"),
          followed,
          or(
            isNull(wallets.lastViewedAt),
            lte(wallets.lastViewedAt, new Date(at.getTime() - VIEWED_EVERY_MS)),
          ),
        ),
      );
  };
};
