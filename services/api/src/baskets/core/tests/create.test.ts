import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { JsonBasketStore } from "../../glider/store.js";
import { BasketService } from "../service.js";
import type { BasketAssetStore, BasketProvider, CustomBasketStore } from "../deps.js";
import { assetIdFor, type BasketAsset, type CustomBasket, type ProviderBasket } from "../primitives.js";

const MINE = "user-1";
const NVDA = "mint-nvda";
const TSLA = "mint-tsla";

const asset = (mint: string, ticker: string): BasketAsset => ({
  mint,
  ticker,
  name: ticker,
  symbol: `${ticker}on`,
  decimals: 6,
  logoUrl: null,
});

const assetStore = (): BasketAssetStore =>
  ({
    all: () => Promise.resolve([asset(NVDA, "NVDA"), asset(TSLA, "TSLA")]),
  }) as unknown as BasketAssetStore;

/** Enough of the real store's behaviour to see what create wrote. */
const customStore = () => {
  const rows: CustomBasket[] = [];
  const store = {
    draft: (input: Omit<CustomBasket, "id" | "providerId" | "createdAt" | "updatedAt">) => {
      const row: CustomBasket = {
        ...input,
        id: `basket-${rows.length + 1}`,
        providerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    attachStrategy: (id: string, providerId: string) => {
      const row = rows.findIndex((item) => item.id === id);
      rows[row] = { ...rows[row]!, providerId };
      return Promise.resolve();
    },
  } as unknown as CustomBasketStore;
  return { store, rows };
};

const remote = (id: string, name: string, assets: ProviderBasket["assets"]): ProviderBasket => ({
  id,
  name,
  description: "",
  assets,
  schedule: { type: "interval", frequency: "daily" },
});

const service = (provider: Partial<BasketProvider>, custom = customStore()) => ({
  custom,
  service: new BasketService({
    store: new JsonBasketStore("postgres://unused", catalogJson),
    assetStore: assetStore(),
    customBaskets: custom.store,
    provider: {
      validate: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      ...provider,
    } as unknown as BasketProvider,
  }),
});

const DRAFT = {
  name: "My AI Bet",
  description: "  two names  ",
  assets: [
    { assetId: assetIdFor(NVDA), weightBps: 6000 },
    { assetId: assetIdFor(TSLA), weightBps: 4000 },
  ],
};

const asSent = (calls: { name: string; assets: ProviderBasket["assets"] }[]) => calls[0]!;

describe("creating a basket somebody wrote", () => {
  it("writes the row, then gives it a strategy", async () => {
    const { service: svc, custom } = service({
      create: () => Promise.resolve("strategy-1"),
      get: (id: string) =>
        Promise.resolve(
          remote(
            id,
            custom.rows[0]!.slug,
            DRAFT.assets.map((a) => ({ ...a })),
          ),
        ),
    });
    const made = await svc.create(MINE, DRAFT);

    expect(made.providerId).toBe("strategy-1");
    expect(custom.rows[0]).toMatchObject({ userId: MINE, name: "My AI Bet", providerId: "strategy-1" });
    expect(made.slug).toMatch(/^my-ai-bet-[0-9a-z]{8}$/);
  });

  // The picker sends an id; the name is the catalogue's to say.
  it("takes tickers from the catalogue, not from the request", async () => {
    const { service: svc, custom } = service({
      create: () => Promise.resolve("strategy-1"),
      get: (id: string) =>
        Promise.resolve(
          remote(
            id,
            custom.rows[0]!.slug,
            DRAFT.assets.map((a) => ({ ...a })),
          ),
        ),
    });
    await svc.create(MINE, { ...DRAFT, assets: DRAFT.assets.map((a) => ({ ...a, ticker: "WRONG" })) });
    expect(custom.rows[0]!.assets.map((a) => a.ticker)).toEqual(["NVDA", "TSLA"]);
  });

  // Recovery finds a strategy by name, and two people will both write "My AI Bet".
  it("names the strategy by slug, which is unique, and never by what the author typed", async () => {
    const sent: { name: string; assets: ProviderBasket["assets"] }[] = [];
    const { service: svc, custom } = service({
      validate: (def: { name: string; assets: ProviderBasket["assets"] }) => {
        sent.push(def);
        return Promise.resolve();
      },
      create: () => Promise.resolve("strategy-1"),
      get: (id: string) =>
        Promise.resolve(
          remote(
            id,
            custom.rows[0]!.slug,
            DRAFT.assets.map((a) => ({ ...a })),
          ),
        ),
    });
    await svc.create(MINE, DRAFT);
    expect(asSent(sent).name).toBe(custom.rows[0]!.slug);
    expect(asSent(sent).name).not.toBe("My AI Bet");
  });

  // A dead connection may still have been accepted, on a tenant that cannot delete.
  it("adopts the strategy a failed create had already made", async () => {
    const custom = customStore();
    const { service: svc } = service(
      {
        create: () => Promise.reject(new Error("socket hang up")),
        list: () =>
          Promise.resolve([
            remote("strategy-other", "someone-elses-aaaaaaaa", []),
            remote(
              "strategy-1",
              custom.rows[0]!.slug,
              DRAFT.assets.map((a) => ({ ...a })),
            ),
          ]),
        get: (id: string) =>
          Promise.resolve(
            remote(
              id,
              custom.rows[0]!.slug,
              DRAFT.assets.map((a) => ({ ...a })),
            ),
          ),
      },
      custom,
    );
    expect((await svc.create(MINE, DRAFT)).providerId).toBe("strategy-1");
  });

  it("re-throws rather than adopting a namesake holding something else", async () => {
    const custom = customStore();
    const { service: svc } = service(
      {
        create: () => Promise.reject(new Error("socket hang up")),
        list: () =>
          Promise.resolve([
            remote("strategy-1", custom.rows[0]?.slug ?? "", [
              { assetId: assetIdFor(NVDA), weightBps: 10_000 },
            ]),
          ]),
      },
      custom,
    );
    await expect(svc.create(MINE, DRAFT)).rejects.toThrow("socket hang up");
  });

  /* Glider holding something we did not ask for must never be recorded. */
  it("refuses a readback that disagrees with what was sent", async () => {
    const { service: svc, custom } = service({
      create: () => Promise.resolve("strategy-1"),
      get: (id: string) =>
        Promise.resolve(
          remote(id, "a-different-basket-aaaaaaaa", [{ assetId: assetIdFor(NVDA), weightBps: 10_000 }]),
        ),
    });
    await expect(svc.create(MINE, DRAFT)).rejects.toThrow(/stored a different basket/);
    expect(custom.rows[0]!.providerId).toBeNull();
  });

  /* The row lands first, so a half-failed create leaves something to retry. */
  it("keeps the draft when Glider refuses it", async () => {
    const { service: svc, custom } = service({
      validate: () => Promise.reject(new Error("strategy name already in use")),
    });
    await expect(svc.create(MINE, DRAFT)).rejects.toThrow();
    expect(custom.rows).toHaveLength(1);
    expect(custom.rows[0]!.providerId).toBeNull();
  });

  it("refuses a bad draft before writing anything", async () => {
    const { service: svc, custom } = service({});
    await expect(
      svc.create(MINE, { ...DRAFT, assets: [{ assetId: assetIdFor(NVDA), weightBps: 9000 }] }),
    ).rejects.toMatchObject({ code: "weights_must_total_10000", status: 422 });
    expect(custom.rows).toHaveLength(0);
  });
});
