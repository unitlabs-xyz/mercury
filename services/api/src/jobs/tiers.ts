import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { wallets } from "../db/schema.js";
import { followed } from "../wallets/active.js";

/** A linked wallet someone looked at within this long is read as one in use. */
export const VIEWED_WITHIN_MS = 7 * 24 * 60 * 60_000;
/** How often a linked wallet in use is read when the jobs are polling. */
export const RECENT_IDLE_MS = 5 * 60_000;
/** How often any other linked wallet is read when the jobs are polling. */
export const DORMANT_IDLE_MS = 60 * 60_000;

/**
 * How often a linked wallet is read while the jobs poll, by how recently
 * anyone looked at it.
 *
 * Only for polling, which is the fallback: with the stream up, a wallet is
 * read when something happens to it, linked or not. When the stream is down,
 * the Mercury wallet keeps the cadence it always had, and a linked wallet is
 * read every five minutes if it was viewed in the last week and hourly if not.
 * A wallet being looked at now is read every pass whatever this says; that is
 * presence, in `cadence`.
 *
 * A loan is not slowed by any of this: `loan-watch` reads every loan on its
 * own clock.
 */
export const viewedTiers = (opts: { readonly now?: () => number } = {}) => {
  const now = opts.now ?? Date.now;
  let viewed = new Map<string, number | null>();
  return {
    /** The followed linked wallets and when each was last viewed. Replaces what was known. */
    load(rows: readonly { readonly address: string; readonly lastViewedAt: Date | null }[]) {
      viewed = new Map(rows.map((r) => [r.address, r.lastViewedAt?.getTime() ?? null]));
    },
    /** A linked wallet's idle interval; undefined for any other, which keeps its job's own. */
    idleFor(wallet: string): number | undefined {
      if (!viewed.has(wallet)) return undefined;
      const at = viewed.get(wallet) ?? null;
      return at !== null && now() - at < VIEWED_WITHIN_MS ? RECENT_IDLE_MS : DORMANT_IDLE_MS;
    },
  };
};

/** The followed linked wallets and when each was last viewed. One indexed read. */
export const linkedViewings = (db: Db) =>
  db
    .select({ address: wallets.address, lastViewedAt: wallets.lastViewedAt })
    .from(wallets)
    .where(and(eq(wallets.kind, "external"), followed));
