import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { JsonBasketStore } from "../../glider/store.js";
import { BasketService } from "../service.js";
import type { BasketProvider, CustomBasketStore } from "../deps.js";
import type { CustomBasket } from "../primitives.js";

const OWNER = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:Wallet";
const MINE = "user-1";

const basket = (over: Partial<CustomBasket> = {}): CustomBasket => ({
  id: "basket-1",
  userId: MINE,
  slug: "my-ai-bet-7fq2kx9m",
  name: "My AI Bet",
  description: "",
  assets: [{ assetId: "solana:x/spl:mint-nvda", ticker: "NVDA", weightBps: 10000 }],
  providerId: "strategy-custom",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

/** Only the owner's own baskets are ever returned, as the real store does. */
const customStore = (rows: readonly CustomBasket[]): CustomBasketStore =>
  ({
    bySlug: (userId: string, slug: string) =>
      Promise.resolve(rows.find((r) => r.userId === userId && r.slug === slug) ?? null),
    mine: (userId: string) => Promise.resolve(rows.filter((r) => r.userId === userId)),
  }) as unknown as CustomBasketStore;

const service = (rows: readonly CustomBasket[], asked: string[]) =>
  new BasketService({
    store: new JsonBasketStore("postgres://unused", catalogJson),
    customBaskets: customStore(rows),
    provider: {
      portfolios: (_owner: string, strategyId: string) => {
        asked.push(strategyId);
        return Promise.resolve([]);
      },
    } as unknown as BasketProvider,
  });

describe("resolving a slug", () => {
  it("finds a curated basket, as it always did", async () => {
    const asked: string[] = [];
    await service([], asked).portfolio("magnificent-seven", MINE, OWNER);
    expect(asked).toEqual([
      catalogJson.strategies.find((s) => s.slug === "magnificent-seven")!.gliderStrategyId,
    ]);
  });

  it("finds the caller's own basket when the catalogue has no such slug", async () => {
    const asked: string[] = [];
    await service([basket()], asked).portfolio("my-ai-bet-7fq2kx9m", MINE, OWNER);
    expect(asked).toEqual(["strategy-custom"]);
  });

  /*
   * The privacy boundary. Custom baskets are addressed on routes shared with
   * the curated catalogue, so resolving somebody else's slug would hand their
   * basket over.
   */
  it("will not resolve another person's basket", async () => {
    const theirs = basket({ userId: "user-2" });
    await expect(service([theirs], []).portfolio(theirs.slug, MINE, OWNER)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("will not resolve a draft, which Glider does not have yet", async () => {
    const draft = basket({ providerId: null });
    await expect(service([draft], []).portfolio(draft.slug, MINE, OWNER)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses an unknown slug rather than reaching for a provider", async () => {
    const asked: string[] = [];
    await expect(service([], asked).portfolio("no-such-basket", MINE, OWNER)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(asked).toEqual([]);
  });
});

describe("reading a basket somebody wrote", () => {
  it("serves the detail page, which the curated catalogue cannot answer for", async () => {
    const mine = await service([basket()], []).detail("my-ai-bet-7fq2kx9m", MINE);
    expect(mine).toMatchObject({
      source: "mine",
      slug: "my-ai-bet-7fq2kx9m",
      name: "My AI Bet",
      strategyId: "strategy-custom",
      allocations: [{ ticker: "NVDA", mint: "mint-nvda", weightBps: 10000 }],
    });
  });

  it("reports a draft as having no strategy behind it yet", async () => {
    const draft = await service([basket({ providerId: null })], []).detail("my-ai-bet-7fq2kx9m", MINE);
    expect(draft).toMatchObject({ strategyId: null });
  });

  it("will not serve another person's basket", async () => {
    const theirs = basket({ userId: "user-2" });
    expect(await service([theirs], []).detail(theirs.slug, MINE)).toBeNull();
  });

  /*
   * The list carries both, and `source` is the only thing separating them.
   * A curated basket gaining that marker by accident would put a private
   * basket on a themed shelf, which is what every shelf filters on.
   */
  it("marks the caller's own baskets apart from the curated ones", async () => {
    const listed = await service([basket()], []).list(MINE);
    expect(listed.filter((item) => item.source === "curated").length).toBe(
      catalogJson.strategies.length,
    );
    expect(listed.filter((item) => item.source === "mine").map((item) => item.slug)).toEqual([
      "my-ai-bet-7fq2kx9m",
    ]);
  });

  it("shows nobody else's basket in the list", async () => {
    const listed = await service([basket({ userId: "user-2" })], []).list(MINE);
    expect(listed.every((item) => item.source === "curated")).toBe(true);
  });
});
