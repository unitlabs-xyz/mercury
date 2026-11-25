import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { instruments, tokens, wallets } from "../db/schema.js";

/** A token that can be moved, as the move sheet names it. */
export interface Movable {
  readonly symbol: string;
  /** The stock it is a share of; null for USDC. */
  readonly ticker: string | null;
  readonly name: string;
  readonly decimals: number;
}

/** What can be moved into the Mercury wallet: every stock Mercury lists, and USDC. */
export const movableMints = async (db: Db, usdcMint: string): Promise<ReadonlyMap<string, Movable>> => {
  const rows = await db
    .select({
      mint: tokens.mint,
      symbol: tokens.symbol,
      ticker: instruments.ticker,
      name: instruments.name,
      decimals: tokens.decimals,
    })
    .from(tokens)
    .innerJoin(instruments, eq(instruments.id, tokens.instrumentId));
  return new Map<string, Movable>([
    [usdcMint, { symbol: "USDC", ticker: null, name: "US dollars", decimals: 6 }],
    ...rows.map(
      (r) => [r.mint, { symbol: r.symbol, ticker: r.ticker, name: r.name, decimals: r.decimals }] as const,
    ),
  ]);
};

/** The person's Mercury wallet's id; null while Privy is still making it. */
export const mercuryWalletIdOf = async (db: Db, userId: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isPrimary, true)))
    .limit(1);
  return row?.id ?? null;
};
