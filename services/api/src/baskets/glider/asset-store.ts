import { asc, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { basketAssets } from "../../db/schema.js";
import type { BasketAssetStore } from "../core/deps.js";
import type { BasketAsset } from "../core/primitives.js";

/**
 * Rows per upsert statement.
 *
 * The whole catalogue is a few hundred rows and would go in one, but Postgres
 * caps a statement at 65535 bound parameters and each row carries six. This
 * leaves room for the list to grow an order of magnitude, while still being
 * one statement rather than a thousand.
 */
const CHUNK = 1000;

const chunked = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** The catalogue in Postgres. Knows nothing about where the list came from. */
export class PgBasketAssetStore implements BasketAssetStore {
  constructor(private readonly db: Db) {}

  async all(): Promise<readonly BasketAsset[]> {
    return this.db
      .select({
        mint: basketAssets.mint,
        ticker: basketAssets.ticker,
        name: basketAssets.name,
        symbol: basketAssets.symbol,
        decimals: basketAssets.decimals,
        logoUrl: basketAssets.logoUrl,
      })
      .from(basketAssets)
      .orderBy(asc(basketAssets.ticker));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(basketAssets);
    return row?.n ?? 0;
  }

  /**
   * One transaction: everything offered is written, and anything this pass did
   * not mention is dropped. Stamping each row with the same instant is what
   * makes "not in this pass" expressible as a single delete.
   */
  async replace(assets: readonly BasketAsset[]): Promise<number> {
    const syncedAt = new Date();
    await this.db.transaction(async (tx) => {
      for (const chunk of chunked(assets, CHUNK)) {
        await tx
          .insert(basketAssets)
          .values(chunk.map((asset) => ({ ...asset, syncedAt })))
          .onConflictDoUpdate({
            target: basketAssets.mint,
            /* `excluded` is the row this statement tried to insert, so one
               statement updates every conflicting mint with its own values
               rather than one statement per row. */
            set: {
              ticker: sql`excluded.ticker`,
              name: sql`excluded.name`,
              symbol: sql`excluded.symbol`,
              decimals: sql`excluded.decimals`,
              logoUrl: sql`excluded.logo_url`,
              syncedAt: sql`excluded.synced_at`,
            },
          });
      }
      /* `lt` rather than a `sql` template: the template hands the driver a
         bare Date, which pglite takes and postgres.js refuses. */
      await tx.delete(basketAssets).where(lt(basketAssets.syncedAt, syncedAt));
    });
    return assets.length;
  }
}
