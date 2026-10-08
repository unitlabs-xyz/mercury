import { describe, expect, it } from "vitest";
import { BasketService } from "../service.js";
import { BasketFundingPreflightError, type BasketProvider, type BasketStore } from "../deps.js";
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
  portfolioReturn: async () => {
    throw new Error("unexpected portfolio return read");
  },
  allocationBreakdown: async () => {
    throw new Error("unexpected allocation read");
  },
  effectiveSwapFeeBps: async () => {
    throw new Error("unexpected fee read");
  },
  portfolios: async () => {
    throw new Error("unexpected portfolio read");
  },
  portfoliosForOwner: async () => {
    throw new Error("unexpected owner portfolio read");
  },
  portfolio: async () => {
    throw new Error("unexpected portfolio detail read");
  },
  positions: async () => {
    throw new Error("unexpected positions read");
  },
  operation: async () => {
    throw new Error("unexpected operation read");
  },
  triggerRebalance: async () => {
    throw new Error("unexpected rebalance");
  },
  prepareExit: async () => {
    throw new Error("unexpected exit prepare");
  },
  submitExit: async () => {
    throw new Error("unexpected exit submit");
  },
  prepareEnrollment: async () => {
    throw new Error("unexpected enrollment prepare");
  },
  enroll: async () => {
    throw new Error("unexpected enrollment submit");
  },
  ...changes,
});
const store = (definition: BasketTemplate) => ({
  load: async () => [definition],
  withSyncLock: async <T>(work: () => Promise<T>) => work(),
  saveEnrollmentIntent: async () => {
    throw new Error("unexpected enrollment save");
  },
  enrollmentIntent: async () => {
    throw new Error("unexpected enrollment read");
  },
  completeEnrollmentIntent: async () => {
    throw new Error("unexpected enrollment completion");
  },
  saveRebalance: async () => {
    throw new Error("unexpected rebalance save");
  },
  exitIntent: async () => null,
  saveExitIntent: async () => {
    throw new Error("unexpected exit save");
  },
  attachExitOperation: async () => {
    throw new Error("unexpected exit completion");
  },
  recentActions: async () => [],
  confirmFunding: async () => {
    throw new Error("unexpected funding confirmation");
  },
  recentFunding: async () => [],
  recentSettlements: async () => [],
  completedEnrollments: async () => [],
});

describe("BasketService sync", () => {
  it("uses recorded IDs without a provider call or database lock", async () => {
    const service = new BasketService({
      store: {
        ...store(basket),
        load: async () => [basket],
        withSyncLock: async () => {
          throw new Error("unexpected lock");
        },
      },
      provider: {
        ...provider(),
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
        allocationBreakdown: async () => {
          throw new Error("unexpected provider call");
        },
        effectiveSwapFeeBps: async () => {
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
    expect.objectContaining({ slug: "nvidia", performance: null, canEnroll: true }),
  );
});

it("prepares funding only for the signed-in owner's Glider Solana account", async () => {
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:11111111111111111111111111111111";
  const destination = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:22222222222222222222222222222222";
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      portfolios: async () => [
        {
          portfolioId: "portfolio-1",
          ownerAccountId: owner,
          strategyId: "remote-1",
          smartAccounts: [{ accountId: destination }],
        },
      ],
    }),
    funding: {
      prepare: async (_owner, account, amountRaw) => ({
        transaction: `${account}:${amountRaw}`,
        expiresAt: new Date("2026-10-06T12:00:00Z"),
      }),
    },
  });

  expect(await service.prepareFunding("nvidia", owner, "12.345678")).toEqual({
    portfolioId: "portfolio-1",
    destinationAccountId: destination,
    amountRaw: "12345678",
    transaction: `${destination}:12345678`,
    expiresAt: "2026-10-06T12:00:00.000Z",
  });
});

it("refuses funding when Glider returns a portfolio owned by another wallet", async () => {
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      portfolios: async () => [
        {
          portfolioId: "wrong-owner",
          ownerAccountId: "solana:other:Attacker",
          strategyId: "remote-1",
          smartAccounts: [{ accountId: "solana:other:AttackerVault" }],
        },
      ],
    }),
    funding: {
      prepare: async () => {
        throw new Error("must not build transfer");
      },
    },
  });
  await expect(service.prepareFunding("nvidia", "solana:mainnet:Owner", "1")).rejects.toMatchObject({
    code: "funding_unavailable",
  });
});

it("reports a failed transfer simulation without presenting it as an enrollment failure", async () => {
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:11111111111111111111111111111111";
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      portfolios: async () => [
        {
          portfolioId: "portfolio-1",
          ownerAccountId: owner,
          strategyId: "remote-1",
          smartAccounts: [
            { accountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:22222222222222222222222222222222" },
          ],
        },
      ],
    }),
    funding: {
      prepare: async () => {
        throw new BasketFundingPreflightError();
      },
    },
  });

  await expect(service.prepareFunding("nvidia", owner, "1")).rejects.toMatchObject({
    code: "funding_preflight_failed",
    status: 422,
  });
});

it("reads balances and schedule only for the enrolled owner", async () => {
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:owner";
  const service = new BasketService({
    store: store({ ...basket, status: "disabled" }),
    provider: provider({
      portfolios: async () => [
        { portfolioId: "p-1", ownerAccountId: owner, strategyId: "remote-1", smartAccounts: [] },
      ],
      portfolio: async () => ({
        portfolioId: "p-1",
        ownerAccountId: owner,
        strategyId: "remote-1",
        smartAccounts: [],
        schedule: {
          status: "active",
          frequency: "daily",
          intervalMs: 86_400_000,
          nextDueAt: "2026-10-07T00:00:00Z",
          lastRebalanceAt: null,
        },
      }),
      positions: async () => ({
        portfolioId: "p-1",
        totalValueUsd: "50.000000",
        inTransitUsd: "0",
        fetchedAt: "2026-10-06T00:00:00Z",
        assets: [
          {
            assetId:
              "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            smartAccountId: "solana:account",
            symbol: "USDC",
            decimals: 6,
            balance: "50",
            balanceRaw: "50000000",
            priceUsd: "1",
            valueUsd: "50",
          },
        ],
        warnings: [],
      }),
    }),
  });
  expect(await service.portfolioSnapshot("nvidia", owner)).toMatchObject({
    portfolioId: "p-1",
    totalValueUsd: "50.000000",
    schedule: { status: "active" },
    assets: [{ symbol: "USDC", balance: "50" }],
  });
});

it("rejects a provider portfolio belonging to another owner before reading its balances", async () => {
  let readPositions = false;
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      portfolios: async () => [
        { portfolioId: "p-1", ownerAccountId: "other", strategyId: "remote-1", smartAccounts: [] },
      ],
      positions: async () => {
        readPositions = true;
        throw new Error("must not read");
      },
    }),
  });
  await expect(service.portfolioSnapshot("nvidia", "owner")).rejects.toMatchObject({
    code: "portfolio_unavailable",
  });
  expect(readPositions).toBe(false);
});

it("prepares a full in-kind exit for the verified owner and refuses a redirected submission", async () => {
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
  const assetId = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const message = {
    portfolioId: "p-1",
    recipientAccountId: owner,
    assets: [{ assetId, amountRaw: "1000000" }],
    nonce: `0x${"a".repeat(64)}`,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    liquidate: false,
  };
  let submitted = 0;
  let recorded = 0;
  let attached = 0;
  let saved: Parameters<BasketStore["saveExitIntent"]>[0] | undefined;
  const service = new BasketService({
    store: {
      ...store(basket),
      saveExitIntent: async (action) => {
        recorded += 1;
        saved = action;
        return {
          id: "intent-1",
          ...action,
          payload: {
            ...action.payload,
            authorization: {
              ...action.payload.authorization,
              message: Object.fromEntries(
                Object.entries(action.payload.authorization.message).reverse(),
              ) as typeof action.payload.authorization.message,
            },
          },
          operationId: null,
          submittedAt: null,
          createdAt: new Date(),
        };
      },
      attachExitOperation: async () => {
        attached += 1;
      },
    },
    provider: provider({
      portfolios: async () => [
        {
          portfolioId: "p-1",
          ownerAccountId: owner,
          strategyId: "remote-1",
          smartAccounts: [{ accountId: owner }],
        },
      ],
      portfolio: async () => ({
        portfolioId: "p-1",
        ownerAccountId: owner,
        strategyId: "remote-1",
        smartAccounts: [{ accountId: owner }],
        schedule: null,
      }),
      positions: async () => ({
        portfolioId: "p-1",
        totalValueUsd: "1",
        inTransitUsd: "0",
        fetchedAt: new Date().toISOString(),
        warnings: [],
        assets: [
          {
            assetId,
            smartAccountId: owner,
            symbol: "USDC",
            decimals: 6,
            balance: "1",
            balanceRaw: "1000000",
            priceUsd: "1",
            valueUsd: "1",
          },
        ],
      }),
      prepareExit: async (_id, _mode, _recipient, assets) => {
        expect(assets).toEqual(message.assets);
        return {
          expiresAt: new Date(message.expiresAt * 1000).toISOString(),
          authorization: { kind: "solana-message", text: "Sign full exit" },
          message,
        };
      },
      submitExit: async () => {
        expect(saved).toBeDefined();
        submitted += 1;
        return { operationId: "op-exit", submittedAt: new Date().toISOString() };
      },
    }),
    history: {
      tokenAccountsFor: async () => [],
      signatures: async () => [{ signature: "baseline", slot: 1, blockTime: 1_790_000_000, failed: false }],
      transaction: async () => null,
    },
  });
  await expect(service.prepareExit("nvidia", owner, "in_kind")).resolves.toMatchObject({ message });
  expect(recorded).toBe(0);
  await expect(
    service.submitExit(
      "nvidia",
      "user-1",
      owner,
      "in_kind",
      { ...message, recipientAccountId: `${owner}Different` },
      "signed",
    ),
  ).rejects.toMatchObject({ code: "invalid_exit" });
  expect(submitted).toBe(0);
  await expect(
    service.submitExit("nvidia", "user-1", owner, "in_kind", message, "signed"),
  ).resolves.toMatchObject({ operationId: "op-exit", mode: "in_kind" });
  expect(submitted).toBe(1);
  expect(recorded).toBe(1);
  expect(attached).toBe(1);
  expect(saved).toMatchObject({
    nonce: message.nonce,
    portfolioId: "p-1",
    payload: {
      baselineSignature: "baseline",
      smartAccountId: owner,
      recipientAccountId: owner,
      mode: "in_kind",
      authorizedAssets: [{ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amountRaw: "1000000" }],
    },
  });
});

it("prepares selected in-kind amounts against live balances without changing the full-exit path", async () => {
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
  const prefix = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:";
  const first = `${prefix}FirstMint`;
  const second = `${prefix}SecondMint`;
  const prepared: { assetId: string; amountRaw: string }[][] = [];
  const submissions: string[] = [];
  const service = new BasketService({
    store: store(basket),
    provider: provider({
      portfolios: async () => [
        {
          portfolioId: "p-1",
          ownerAccountId: owner,
          strategyId: "remote-1",
          smartAccounts: [{ accountId: owner }],
        },
      ],
      portfolio: async () => ({
        portfolioId: "p-1",
        ownerAccountId: owner,
        strategyId: "remote-1",
        smartAccounts: [{ accountId: owner }],
        schedule: null,
      }),
      positions: async () => ({
        portfolioId: "p-1",
        totalValueUsd: "3",
        inTransitUsd: "0",
        fetchedAt: new Date().toISOString(),
        warnings: [],
        assets: [
          {
            assetId: first,
            smartAccountId: owner,
            symbol: "ONE",
            decimals: 6,
            balance: "1",
            balanceRaw: "1000000",
            priceUsd: "1",
            valueUsd: "1",
          },
          {
            assetId: second,
            smartAccountId: owner,
            symbol: "TWO",
            decimals: 6,
            balance: "2",
            balanceRaw: "2000000",
            priceUsd: "1",
            valueUsd: "2",
          },
        ],
      }),
      prepareExit: async (portfolioId, mode, recipientAccountId, assets, submission) => {
        prepared.push([...assets]);
        submissions.push(submission);
        const expiresAt = Math.floor(Date.now() / 1000) + 600;
        return {
          expiresAt: new Date(expiresAt * 1000).toISOString(),
          authorization: { kind: "solana-message" as const, text: "Sign withdrawal" },
          message: {
            portfolioId,
            recipientAccountId,
            assets: [...assets],
            nonce: `0x${"b".repeat(64)}`,
            expiresAt,
            liquidate: mode === "liquidate_usdc",
            ...(mode === "liquidate_usdc"
              ? { settlementAssetId: `${prefix}EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` }
              : {}),
          },
        };
      },
    }),
  });
  await service.prepareExit("nvidia", owner, "in_kind", [{ assetId: first, amountRaw: "500000" }]);
  await service.prepareExit("nvidia", owner, "in_kind", [{ assetId: second, amountRaw: "2000000" }]);
  await expect(
    service.prepareExit("nvidia", owner, "liquidate_usdc", [{ assetId: first, amountRaw: "500000" }]),
  ).resolves.toMatchObject({ submission: "withdraw", message: { liquidate: true } });
  await expect(service.prepareExit("nvidia", owner, "liquidate_usdc")).resolves.toMatchObject({
    submission: "liquidate_all",
  });
  expect(prepared).toEqual([
    [{ assetId: first, amountRaw: "500000" }],
    [{ assetId: second, amountRaw: "2000000" }],
    [{ assetId: first, amountRaw: "500000" }],
    [
      { assetId: first, amountRaw: "1000000" },
      { assetId: second, amountRaw: "2000000" },
    ],
  ]);
  expect(submissions).toEqual(["withdraw", "withdraw", "withdraw", "liquidate_all"]);
  await expect(
    service.prepareExit("nvidia", owner, "in_kind", [{ assetId: first, amountRaw: "1000001" }]),
  ).rejects.toMatchObject({ code: "invalid_exit_amount" });
  await expect(
    service.prepareExit("nvidia", owner, "in_kind", [
      { assetId: first, amountRaw: "1" },
      { assetId: first, amountRaw: "1" },
    ]),
  ).rejects.toMatchObject({ code: "invalid_exit_amount" });
  expect(prepared).toHaveLength(4);
});

it("does not submit a withdrawal when its durable intent cannot be saved", async () => {
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk";
  const message = {
    portfolioId: "p-1",
    recipientAccountId: owner,
    assets: [
      {
        assetId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amountRaw: "1",
      },
    ],
    nonce: `0x${"b".repeat(64)}`,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  };
  let submitted = 0;
  const service = new BasketService({
    store: {
      ...store(basket),
      saveExitIntent: async () => {
        throw new Error("db unavailable");
      },
    },
    provider: provider({
      portfolios: async () => [
        {
          portfolioId: "p-1",
          ownerAccountId: owner,
          strategyId: "remote-1",
          smartAccounts: [{ accountId: owner }],
        },
      ],
      portfolio: async () => ({
        portfolioId: "p-1",
        ownerAccountId: owner,
        strategyId: "remote-1",
        smartAccounts: [{ accountId: owner }],
        schedule: null,
      }),
      submitExit: async () => {
        submitted += 1;
        return { operationId: "accepted-op", submittedAt: new Date().toISOString() };
      },
    }),
    history: {
      tokenAccountsFor: async () => [],
      signatures: async () => [],
      transaction: async () => null,
    },
  });
  await expect(service.submitExit("nvidia", "user-1", owner, "in_kind", message, "signed")).rejects.toThrow(
    "db unavailable",
  );
  expect(submitted).toBe(0);
});
