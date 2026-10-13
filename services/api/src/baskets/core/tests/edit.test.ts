import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { JsonBasketStore } from "../../glider/store.js";
import { BasketService } from "../service.js";
import type { BasketAssetStore, BasketProvider, CustomBasketStore } from "../deps.js";
import { assetIdFor, type BasketAsset, type CustomBasket, type ProviderBasket } from "../primitives.js";

const MINE = "user-1";
const OWNER = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:Wallet";
const NVDA = assetIdFor("mint-nvda");
const TSLA = assetIdFor("mint-tsla");

const asset = (mint: string, ticker: string): BasketAsset => ({
  mint,
  ticker,
  name: ticker,
  symbol: `${ticker}on`,
  decimals: 6,
  logoUrl: null,
});

const assetStore = () =>
  ({
    all: () => Promise.resolve([asset("mint-nvda", "NVDA"), asset("mint-tsla", "TSLA")]),
  }) as unknown as BasketAssetStore;

const basket = (over: Partial<CustomBasket> = {}): CustomBasket => ({
  id: "basket-1",
  userId: MINE,
  slug: "my-ai-bet-7fq2kx9m",
  name: "My AI Bet",
  description: "",
  assets: [{ assetId: NVDA, ticker: "NVDA", weightBps: 10_000 }],
  providerId: "strategy-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

/** Records what the service asked the store to write. */
const customStore = (rows: readonly CustomBasket[]) => {
  const wrote: { op: string; args: unknown[] }[] = [];
  const store = {
    bySlug: (userId: string, slug: string) =>
      Promise.resolve(rows.find((r) => r.userId === userId && r.slug === slug) ?? null),
    rename: (...args: unknown[]) => {
      wrote.push({ op: "rename", args });
      return Promise.resolve();
    },
    reviseAssets: (...args: unknown[]) => {
      wrote.push({ op: "reviseAssets", args });
      return Promise.resolve();
    },
    remove: (...args: unknown[]) => {
      wrote.push({ op: "remove", args });
      return Promise.resolve();
    },
  } as unknown as CustomBasketStore;
  return { store, wrote };
};

const remote = (id: string, name: string, assets: ProviderBasket["assets"]): ProviderBasket => ({
  id,
  name,
  description: "",
  assets,
  schedule: { type: "interval", frequency: "daily" },
});

const service = (rows: readonly CustomBasket[], provider: Partial<BasketProvider> = {}) => {
  const custom = customStore(rows);
  return {
    custom,
    service: new BasketService({
      store: new JsonBasketStore("postgres://unused", catalogJson),
      assetStore: assetStore(),
      customBaskets: custom.store,
      provider: provider as unknown as BasketProvider,
    }),
  };
};

const SPLIT = [
  { assetId: NVDA, weightBps: 6000 },
  { assetId: TSLA, weightBps: 4000 },
];
const published = (assets = SPLIT) => remote("strategy-1", "my-ai-bet-7fq2kx9m", assets);

describe("renaming a basket somebody wrote", () => {
  // Glider holds the slug, so there is nothing out there a rename could change.
  it("writes only our own row, and never calls Glider", async () => {
    const { service: svc, custom } = service([basket()]);
    const after = await svc.rename(MINE, "my-ai-bet-7fq2kx9m", "  All In  ", "  one stock  ");
    expect(after).toMatchObject({ name: "All In", description: "one stock" });
    expect(custom.wrote).toEqual([{ op: "rename", args: ["basket-1", "All In", "one stock"] }]);
  });

  it("refuses an empty name without writing", async () => {
    const { service: svc, custom } = service([basket()]);
    await expect(svc.rename(MINE, "my-ai-bet-7fq2kx9m", "   ", "")).rejects.toMatchObject({
      code: "name_required",
    });
    expect(custom.wrote).toEqual([]);
  });

  // A rename must not re-check assets: one could have been delisted since.
  it("renames a basket holding something no longer in the catalogue", async () => {
    const stale = basket({
      assets: [{ assetId: assetIdFor("mint-gone"), ticker: "GONE", weightBps: 10_000 }],
    });
    const { service: svc } = service([stale]);
    await expect(svc.rename(MINE, stale.slug, "All In", "")).resolves.toMatchObject({ name: "All In" });
  });
});

describe("changing what a basket holds", () => {
  it("publishes the allocation, then records it", async () => {
    const asked: unknown[] = [];
    const { service: svc, custom } = service([basket()], {
      publishAllocation: (...args: unknown[]) => {
        asked.push(args);
        return Promise.resolve();
      },
      get: () => Promise.resolve(published()),
    });
    const after = await svc.reviseAssets(MINE, "my-ai-bet-7fq2kx9m", SPLIT);

    expect(asked).toEqual([["strategy-1", SPLIT]]);
    expect(after.assets).toEqual([
      { assetId: NVDA, ticker: "NVDA", weightBps: 6000 },
      { assetId: TSLA, ticker: "TSLA", weightBps: 4000 },
    ]);
    expect(custom.wrote[0]!.op).toBe("reviseAssets");
  });

  // A dropped connection may still have applied it.
  it("accepts a failed publish that Glider had already applied", async () => {
    const { service: svc, custom } = service([basket()], {
      publishAllocation: () => Promise.reject(new Error("socket hang up")),
      get: () => Promise.resolve(published()),
    });
    await svc.reviseAssets(MINE, "my-ai-bet-7fq2kx9m", SPLIT);
    expect(custom.wrote[0]!.op).toBe("reviseAssets");
  });

  // Recording one Glider refused would leave the next edit comparing against a lie.
  it("leaves our row alone when the publish really did fail", async () => {
    const { service: svc, custom } = service([basket()], {
      publishAllocation: () => Promise.reject(new Error("socket hang up")),
      get: () => Promise.resolve(published([{ assetId: NVDA, weightBps: 10_000 }])),
    });
    await expect(svc.reviseAssets(MINE, "my-ai-bet-7fq2kx9m", SPLIT)).rejects.toThrow("socket hang up");
    expect(custom.wrote).toEqual([]);
  });

  it("refuses a readback that disagrees with what was published", async () => {
    const { service: svc, custom } = service([basket()], {
      publishAllocation: () => Promise.resolve(),
      get: () => Promise.resolve(published([{ assetId: NVDA, weightBps: 10_000 }])),
    });
    await expect(svc.reviseAssets(MINE, "my-ai-bet-7fq2kx9m", SPLIT)).rejects.toThrow(
      /stored a different basket/,
    );
    expect(custom.wrote).toEqual([]);
  });

  // Nothing to publish against yet.
  it("records a draft's new assets without reaching for Glider", async () => {
    const { service: svc, custom } = service([basket({ providerId: null })], {});
    await svc.reviseAssets(MINE, "my-ai-bet-7fq2kx9m", SPLIT);
    expect(custom.wrote[0]!.op).toBe("reviseAssets");
  });

  it("refuses weights that do not total 100%", async () => {
    const { service: svc, custom } = service([basket()], {});
    await expect(
      svc.reviseAssets(MINE, "my-ai-bet-7fq2kx9m", [{ assetId: NVDA, weightBps: 9000 }]),
    ).rejects.toMatchObject({ code: "weights_must_total_10000" });
    expect(custom.wrote).toEqual([]);
  });
});

describe("deleting a basket somebody wrote", () => {
  const funded = (totalValueUsd: string, inTransitUsd = "0") =>
    ({
      portfolios: () => Promise.resolve([{ portfolioId: "p-1" }]),
      positions: () => Promise.resolve({ totalValueUsd, inTransitUsd }),
    }) as unknown as Partial<BasketProvider>;

  it("retires an empty basket", async () => {
    const { service: svc, custom } = service([basket()], funded("0"));
    await svc.remove(MINE, "my-ai-bet-7fq2kx9m", OWNER);
    expect(custom.wrote).toEqual([{ op: "remove", args: ["basket-1"] }]);
  });

  // Glider cannot delete a strategy, so money left behind is money hidden.
  it("refuses while it still holds something", async () => {
    const { service: svc, custom } = service([basket()], funded("12.50"));
    await expect(svc.remove(MINE, "my-ai-bet-7fq2kx9m", OWNER)).rejects.toMatchObject({
      code: "basket_funded",
      status: 409,
    });
    expect(custom.wrote).toEqual([]);
  });

  // Settled at zero is not empty while a deposit is on its way in.
  it("refuses while money is still in transit", async () => {
    const { service: svc } = service([basket()], funded("0", "25"));
    await expect(svc.remove(MINE, "my-ai-bet-7fq2kx9m", OWNER)).rejects.toMatchObject({
      code: "basket_funded",
    });
  });

  it("retires a draft, which has no strategy to check", async () => {
    const { service: svc, custom } = service([basket({ providerId: null })], {});
    await svc.remove(MINE, "my-ai-bet-7fq2kx9m", OWNER);
    expect(custom.wrote).toEqual([{ op: "remove", args: ["basket-1"] }]);
  });
});

describe("whose basket it is", () => {
  it.each(["rename", "reviseAssets", "remove"] as const)("%s refuses a curated slug", async (op) => {
    const { service: svc, custom } = service([basket()], {});
    const call = {
      rename: () => svc.rename(MINE, "magnificent-seven", "Mine now", ""),
      reviseAssets: () => svc.reviseAssets(MINE, "magnificent-seven", SPLIT),
      remove: () => svc.remove(MINE, "magnificent-seven", OWNER),
    }[op];
    await expect(call()).rejects.toMatchObject({ code: "not_yours", status: 403 });
    expect(custom.wrote).toEqual([]);
  });

  it.each(["rename", "reviseAssets", "remove"] as const)("%s refuses another person's", async (op) => {
    const theirs = basket({ userId: "user-2" });
    const { service: svc, custom } = service([theirs], {});
    const call = {
      rename: () => svc.rename(MINE, theirs.slug, "Mine now", ""),
      reviseAssets: () => svc.reviseAssets(MINE, theirs.slug, SPLIT),
      remove: () => svc.remove(MINE, theirs.slug, OWNER),
    }[op];
    await expect(call()).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(custom.wrote).toEqual([]);
  });
});
