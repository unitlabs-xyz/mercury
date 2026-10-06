import { describe, expect, it } from "vitest";
import { BasketService } from "../service.js";
import { JsonBasketStore } from "../../glider/store.js";
import type { BasketProvider } from "../deps.js";
import type { BasketTemplate } from "../primitives.js";

const basket: BasketTemplate = {
  slug: "nvidia",
  providerId: "remote-1",
  sourceStrategyId: "source-1",
  status: "candidate",
  tags: ["theme:technology"],
  name: "Mercury Solana - Nvidia",
  description: "One Ondo token.",
  assets: [{ ticker: "NVDA", assetId: "solana:mainnet/spl:nvda", weightBps: 10_000 }],
  schedule: { type: "interval", frequency: "daily" },
};

const missing: BasketTemplate = { ...basket };
delete missing.providerId;
const remote = {
  id: "remote-1",
  name: basket.name,
  description: basket.description,
  assets: basket.assets,
  schedule: basket.schedule,
};
const provider = (changes: Partial<BasketProvider> = {}): BasketProvider => ({
  list: async () => {
    throw new Error("unexpected list");
  },
  validate: async () => {
    throw new Error("unexpected validate");
  },
  create: async () => {
    throw new Error("unexpected create");
  },
  get: async () => {
    throw new Error("unexpected get");
  },
  strategyPerformance: async () => {
    throw new Error("unexpected performance read");
  },
  ...changes,
});
const store = (definition: BasketTemplate) => ({
  load: async () => [definition],
  withSyncLock: async <T>(work: () => Promise<T>) => work(),
});

describe("BasketService sync", () => {
  it("uses recorded IDs without a provider call or database lock", async () => {
    const service = new BasketService({
      store: {
        load: async () => [basket],
        withSyncLock: async () => {
          throw new Error("unexpected lock");
        },
      },
      provider: {
        list: async () => {
          throw new Error("unexpected provider call");
        },
        validate: async () => {
          throw new Error("unexpected provider call");
        },
        create: async () => {
          throw new Error("unexpected provider call");
        },
        get: async () => {
          throw new Error("unexpected provider call");
        },
        strategyPerformance: async () => {
          throw new Error("unexpected provider call");
        },
      },
    });

    expect(await service.sync()).toEqual({
      strategyIds: { nvidia: "remote-1" },
      recorded: 1,
      reused: 0,
      created: 0,
    });
  });

  it("reuses one exactly matching provider strategy", async () => {
    const service = new BasketService({
      store: store(missing),
      provider: provider({ list: async () => [remote] }),
    });
    expect(await service.sync()).toEqual({
      strategyIds: { nvidia: "remote-1" },
      recorded: 0,
      reused: 1,
      created: 0,
    });
  });

  it.each([
    ["different allocation", [{ ...remote, assets: [{ ...remote.assets[0]!, weightBps: 5_000 }] }]],
    ["duplicate name", [remote, { ...remote, id: "remote-2" }]],
  ])("refuses a %s without creating", async (_case, existing) => {
    const service = new BasketService({
      store: store(missing),
      provider: provider({ list: async () => existing }),
    });
    await expect(service.sync()).rejects.toThrow(/strategy conflict/i);
  });

  it("validates, creates, and reads back a missing strategy", async () => {
    let validated = false;
    const service = new BasketService({
      store: store(missing),
      provider: provider({
        list: async () => [],
        validate: async () => {
          validated = true;
        },
        create: async () => {
          if (!validated) throw new Error("not validated");
          return "remote-1";
        },
        get: async () => remote,
      }),
    });
    expect(await service.sync()).toEqual({
      strategyIds: { nvidia: "remote-1" },
      recorded: 0,
      reused: 0,
      created: 1,
    });
  });

  it("rejects a readback that belongs to a different strategy ID", async () => {
    const service = new BasketService({
      store: store(missing),
      provider: provider({
        list: async () => [],
        validate: async () => {},
        create: async () => "remote-1",
        get: async () => ({ ...remote, id: "remote-2" }),
      }),
    });
    await expect(service.sync()).rejects.toThrow(/readback mismatch/i);
  });

  it("reconciles an uncertain create without posting twice", async () => {
    let lists = 0;
    let creates = 0;
    const service = new BasketService({
      store: store(missing),
      provider: provider({
        list: async () => (++lists === 1 ? [] : [remote]),
        validate: async () => {},
        create: async () => {
          creates++;
          throw new Error("connection closed after POST");
        },
        get: async () => remote,
      }),
    });
    expect(await service.sync()).toEqual({
      strategyIds: { nvidia: "remote-1" },
      recorded: 0,
      reused: 0,
      created: 1,
    });
    expect(creates).toBe(1);
  });

  it("propagates a rejected create without posting twice", async () => {
    let creates = 0;
    const service = new BasketService({
      store: store(missing),
      provider: provider({
        list: async () => [],
        validate: async () => {},
        create: async () => {
          creates++;
          throw new Error("API_104: Cron schedules are not enabled");
        },
      }),
    });
    await expect(service.sync()).rejects.toThrow(/API_104.*Cron schedules/);
    expect(creates).toBe(1);
  });
});

it("lists the Solana catalog as candidate managed portfolios", async () => {
  const service = new BasketService({ store: new JsonBasketStore("postgres://unused") });
  const templates = await service.listTemplates();

  expect(templates).toHaveLength(22);
  expect(templates.find((template) => template.slug === "magnificent-seven")).toEqual(
    expect.objectContaining({
      kind: "managed_portfolio",
      status: "candidate",
      canEnroll: false,
      strategyId: "01M465MY1C2KBER654KJDCYYK9",
      performance: null,
      allocations: expect.arrayContaining([expect.objectContaining({ ticker: "NVDA", weightBps: 1428 })]),
    }),
  );
});

it("labels a new Solana strategy's target-allocation history as modeled performance", async () => {
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      strategyPerformance: async () => ({
        asOf: "2026-10-05T16:16:11.358Z",
        points: [{ date: "2025-10-05", percentChange: "0.0000" }],
        windows: [{ window: "12m", percentChange: "18.1627", since: "2025-10-05" }],
      }),
    }),
  });

  expect((await service.getTemplate("nvidia"))?.performance).toEqual({
    basis: "modeled_strategy_twr",
    asOf: "2026-10-05T16:16:11.358Z",
    points: [{ date: "2025-10-05", percentChange: "0.0000" }],
    windows: [{ window: "12m", percentChange: "18.1627", since: "2025-10-05" }],
  });
});

it("keeps the catalog available when performance cannot be read", async () => {
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      strategyPerformance: async () => {
        throw new Error("provider unavailable");
      },
    }),
  });

  expect(await service.getTemplate("nvidia")).toEqual(
    expect.objectContaining({ slug: "nvidia", performance: null, canEnroll: false }),
  );
});
