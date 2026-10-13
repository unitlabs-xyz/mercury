import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { customBaskets, type CustomBasketRow } from "../../db/schema.js";
import type { CustomBasketStore } from "../core/deps.js";
import type { CustomBasket } from "../core/primitives.js";

const toBasket = (row: CustomBasketRow): CustomBasket => ({
  id: row.id,
  userId: row.userId,
  slug: row.slug,
  name: row.name,
  description: row.description,
  assets: row.assets as CustomBasket["assets"],
  providerId: row.gliderStrategyId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Baskets people wrote, in Postgres. */
export class PgCustomBasketStore implements CustomBasketStore {
  constructor(private readonly db: Db) {}

  /** Both halves on every read, so a new method cannot forget the owner check. */
  private readonly ownedBy = (userId: string) =>
    and(eq(customBaskets.userId, userId), isNull(customBaskets.deletedAt));

  async mine(userId: string): Promise<readonly CustomBasket[]> {
    const rows = await this.db
      .select()
      .from(customBaskets)
      .where(this.ownedBy(userId))
      .orderBy(desc(customBaskets.createdAt));
    return rows.map(toBasket);
  }

  async bySlug(userId: string, slug: string): Promise<CustomBasket | null> {
    const [row] = await this.db
      .select()
      .from(customBaskets)
      .where(and(this.ownedBy(userId), eq(customBaskets.slug, slug)));
    return row ? toBasket(row) : null;
  }

  async draft(input: {
    userId: string;
    slug: string;
    name: string;
    description: string;
    assets: CustomBasket["assets"];
  }): Promise<CustomBasket> {
    const [row] = await this.db
      .insert(customBaskets)
      .values({
        userId: input.userId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        assets: input.assets,
      })
      .returning();
    if (!row) throw new Error("custom basket draft was not written");
    return toBasket(row);
  }

  async attachStrategy(id: string, providerId: string): Promise<void> {
    await this.db
      .update(customBaskets)
      .set({ gliderStrategyId: providerId, updatedAt: new Date() })
      .where(eq(customBaskets.id, id));
  }

  async reviseAssets(id: string, assets: CustomBasket["assets"]): Promise<void> {
    await this.db
      .update(customBaskets)
      .set({ assets, updatedAt: new Date() })
      .where(eq(customBaskets.id, id));
  }

  async rename(id: string, name: string, description: string): Promise<void> {
    await this.db
      .update(customBaskets)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(customBaskets.id, id));
  }

  /** Soft: the orphaned Glider strategy means the slug must stay spent. */
  async remove(id: string): Promise<void> {
    await this.db
      .update(customBaskets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(customBaskets.id, id));
  }
}
