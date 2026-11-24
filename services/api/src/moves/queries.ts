import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { tokens, wallets } from "../db/schema.js";

/** What can be moved into the Mercury wallet: every stock Mercury lists, and USDC. */
export const movableMints = async (db: Db, usdcMint: string): Promise<ReadonlySet<string>> =>
  new Set([usdcMint, ...(await db.select({ mint: tokens.mint }).from(tokens)).map((t) => t.mint)]);

/** The person's Mercury wallet's id; null while Privy is still making it. */
export const mercuryWalletIdOf = async (db: Db, userId: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isPrimary, true)))
    .limit(1);
  return row?.id ?? null;
};
