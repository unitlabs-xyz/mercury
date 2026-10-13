import { describe, expect, it } from "vitest";
import { testDb } from "../../../db/testing.js";
import { users } from "../../../db/schema.js";
import { PgCustomBasketStore } from "../custom-store.js";
import type { CustomBasket } from "../../core/primitives.js";

const assets: CustomBasket["assets"] = [
  { assetId: "solana:x/spl:mint-nvda", ticker: "NVDA", weightBps: 6000 },
  { assetId: "solana:x/spl:mint-tsla", ticker: "TSLA", weightBps: 4000 },
];

const setup = async () => {
  const db = await testDb();
  const [mine, theirs] = await db
    .insert(users)
    .values([{ privyUserId: "did:privy:mine" }, { privyUserId: "did:privy:theirs" }])
    .returning();
  return { store: new PgCustomBasketStore(db), mine: mine!.id, theirs: theirs!.id };
};

const draft = (store: PgCustomBasketStore, userId: string, slug: string) =>
  store.draft({ userId, slug, name: "My AI Bet", description: "", assets });

describe("PgCustomBasketStore", () => {
  it("writes a draft with no strategy behind it yet", async () => {
    const { store, mine } = await setup();
    const basket = await draft(store, mine, "my-ai-bet-7fq2kx9m");
    expect(basket).toMatchObject({ slug: "my-ai-bet-7fq2kx9m", providerId: null, assets });
  });

  /*
   * The whole of the privacy guarantee. A custom basket is addressed by a
   * slug on routes shared with the curated catalogue, so a read that answered
   * without checking the owner would hand somebody else's basket over.
   */
  it("will not answer for another person's basket", async () => {
    const { store, mine, theirs } = await setup();
    await draft(store, theirs, "their-basket-aaaaaaaa");

    expect(await store.bySlug(mine, "their-basket-aaaaaaaa")).toBeNull();
    expect(await store.mine(mine)).toEqual([]);
  });

  it("refuses a slug already taken, whoever took it", async () => {
    const { store, mine, theirs } = await setup();
    await draft(store, mine, "same-slug-aaaaaaaa");
    await expect(draft(store, theirs, "same-slug-aaaaaaaa")).rejects.toThrow();
  });

  it("goes live once Glider has the strategy", async () => {
    const { store, mine } = await setup();
    const basket = await draft(store, mine, "my-ai-bet-7fq2kx9m");
    await store.attachStrategy(basket.id, "strategy-1");
    expect((await store.bySlug(mine, basket.slug))?.providerId).toBe("strategy-1");
  });

  it("revises what it holds, and what it is called", async () => {
    const { store, mine } = await setup();
    const basket = await draft(store, mine, "my-ai-bet-7fq2kx9m");
    const next: CustomBasket["assets"] = [
      { assetId: "solana:x/spl:mint-nvda", ticker: "NVDA", weightBps: 10000 },
    ];
    await store.reviseAssets(basket.id, next);
    await store.rename(basket.id, "All In", "One stock");

    const after = await store.bySlug(mine, basket.slug);
    expect(after).toMatchObject({ name: "All In", description: "One stock", assets: next });
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(basket.updatedAt.getTime());
  });

  /*
   * Soft, because Glider cannot delete a strategy. The row outliving the
   * basket is what keeps the slug spent, so an orphaned strategy can never be
   * addressed by a new basket that generated the same one.
   */
  it("hides a removed basket but keeps its slug spent", async () => {
    const { store, mine } = await setup();
    const basket = await draft(store, mine, "my-ai-bet-7fq2kx9m");
    await store.remove(basket.id);

    expect(await store.bySlug(mine, basket.slug)).toBeNull();
    expect(await store.mine(mine)).toEqual([]);
    await expect(draft(store, mine, basket.slug)).rejects.toThrow();
  });

  it("lists newest first, because that is the one just made", async () => {
    const { store, mine } = await setup();
    await draft(store, mine, "first-aaaaaaaa");
    await draft(store, mine, "second-bbbbbbbb");
    expect((await store.mine(mine)).map((b) => b.slug)).toEqual(["second-bbbbbbbb", "first-aaaaaaaa"]);
  });
});
