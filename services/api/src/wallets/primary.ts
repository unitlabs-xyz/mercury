import { sql, type SQL } from "drizzle-orm";

/**
 * A person's Mercury wallet, as a subquery an insert can take for `wallet_id`.
 *
 * Every per-wallet table gained `wallet_id` before anything could act for a
 * wallet other than the Mercury one. Until a writer is told which wallet it is
 * acting for, this is the answer it would have given anyway, and it costs no
 * extra round trip: `wallet_one_primary_idx` makes it one index lookup, and
 * guarantees it finds at most one row.
 *
 * A person with no Mercury wallet yet gets null, which the column refuses. That
 * is right: nothing can be bought, borrowed or deposited without a wallet, so
 * a write that reaches here without one is a bug to be loud about.
 *
 * Plain identifiers rather than drizzle columns, because a column inside an
 * insert's values is rendered without its table, and this subquery names its
 * own table.
 */
export const primaryWalletId = (userId: string): SQL<string> =>
  sql<string>`(select "id" from "wallet" where "user_id" = ${userId} and "is_primary")`;
