import { describe, expect, it } from "vitest";
import { BasketService, verifiedBasketFunding } from "../service.js";
import { USDC_MINT } from "@mercury/chain";
import type { BasketProvider, BasketStore } from "../deps.js";
import type { BasketTemplate } from "../primitives.js";

const template: BasketTemplate = {
  slug: "magnificent-seven",
  providerId: "strategy-1",
  sourceStrategyId: "source-1",
  status: "candidate",
  tags: ["theme:technology"],
  name: "Magnificent Seven",
  description: "Technology leaders.",
  assets: [{ ticker: "NVDA", assetId: "solana:mainnet/spl:nvda", weightBps: 10_000 }],
  schedule: { type: "interval", frequency: "daily" },
};

const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5hw9GJx6pajUsh2RSopHi3DesMkSRSh7ad9VGPVPWcyE";
const portfolio = {
  portfolioId: "portfolio-1",
  ownerAccountId: owner,
  strategyId: "strategy-1",
  smartAccounts: [
    { accountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk" },
  ],
};

const provider = (changes: Record<string, unknown> = {}) =>
  ({
    portfolios: async () => [],
    prepareEnrollment: async () => ({
      flowId: "flow-1",
      accountIndex: "0",
      agentAccountId: owner,
      message: { kind: "solana-message", text: "Sign this enrollment" },
    }),
    enroll: async () => portfolio,
    ...changes,
  }) as unknown as BasketProvider;

const store = (changes: Record<string, unknown> = {}) =>
  ({
    load: async () => [template],
    withSyncLock: async <T>(work: () => Promise<T>) => work(),
    saveEnrollmentIntent: async () => "intent-1",
    enrollmentIntent: async () => null,
    completeEnrollmentIntent: async () => undefined,
    saveRebalance: async () => undefined,
    saveExit: async () => undefined,
    recentActions: async () => [],
    confirmFunding: async () => undefined,
    recentFunding: async () => [],
    completedEnrollments: async () => [],
    ...changes,
  }) as BasketStore;

it("credits only a settled equal USDC debit and smart-account credit", () => {
  const sender = owner.split(":").at(-1)!;
  const destination = portfolio.smartAccounts[0]!.accountId.split(":").at(-1)!;
  const entry = (who: string, rawAmount: bigint) => ({
    owner: who,
    mint: USDC_MINT,
    rawAmount,
    decimals: 6,
  });
  const tx = {
    signature: "5".repeat(88),
    blockTime: null,
    succeeded: true,
    accountKeys: [sender, destination],
    feeLamports: 0n,
    preLamports: [],
    postLamports: [],
    preTokens: [entry(sender, 7_000_000n), entry(destination, 0n)],
    postTokens: [entry(sender, 2_000_000n), entry(destination, 5_000_000n)],
  };
  expect(verifiedBasketFunding(tx, sender, destination)).toBe(5_000_000n);
  expect(verifiedBasketFunding({ ...tx, succeeded: false }, sender, destination)).toBeNull();
  expect(
    verifiedBasketFunding(
      { ...tx, postTokens: [entry(sender, 2_000_000n), entry(destination, 4_000_000n)] },
      sender,
      destination,
    ),
  ).toBeNull();
  expect(verifiedBasketFunding(tx, sender, "another-account")).toBeNull();
});

describe("basket enrollment", () => {
  it("lists only the verified owner's curated portfolios and leaves failed balances unavailable", async () => {
    const service = new BasketService({
      store: store({
        completedEnrollments: async () => [
          {
            portfolioId: "portfolio-1",
            strategyId: "strategy-1",
            createdAt: new Date("2026-10-06T00:00:00Z"),
          },
        ],
      }),
      provider: provider({
        portfoliosForOwner: async () => [
          portfolio,
          { ...portfolio, portfolioId: "another-owner", ownerAccountId: "solana:other" },
          { ...portfolio, portfolioId: "other-strategy", strategyId: "strategy-2" },
          { ...portfolio, portfolioId: "unavailable" },
        ],
        positions: async (id: string) => {
          if (id === "unavailable") throw new Error("temporary provider failure");
          return {
            portfolioId: id,
            totalValueUsd: "42.00",
            inTransitUsd: "0",
            fetchedAt: "2026-10-06T00:00:00Z",
            warnings: [],
            assets: [
              {
                assetId: `solana:mainnet/spl:${USDC_MINT}`,
                smartAccountId: "smart-1",
                symbol: "USDC",
                decimals: 6,
                balance: "12.00",
                balanceRaw: "12000000",
                priceUsd: "1",
                valueUsd: "12.00",
              },
            ],
          };
        },
      }),
    });

    const result = await service.ownedPortfolios("user-1", owner);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      portfolioId: "portfolio-1",
      slug: "magnificent-seven",
      totalValueUsd: "42.00",
      usdcBalance: "12.00",
      partial: false,
    });
    expect(result[1]).toMatchObject({
      portfolioId: "unavailable",
      totalValueUsd: null,
      usdcBalance: null,
      partial: true,
    });
  });

  it("shows an existing owner portfolio instead of preparing another enrollment", async () => {
    const service = new BasketService({
      store: store(),
      provider: provider({ portfolios: async () => [portfolio] }),
    });
    expect(await service.enrollment("magnificent-seven", owner)).toEqual(portfolio);
  });

  it("prepares a Solana challenge bound to the verified owner and template", async () => {
    let saved: unknown;
    const service = new BasketService({
      store: store({
        saveEnrollmentIntent: async (intent: unknown) => {
          saved = intent;
          return "intent-1";
        },
      }),
      provider: provider(),
    });
    expect(await service.prepareEnrollment("magnificent-seven", "user-1", owner)).toEqual({
      intentId: "intent-1",
      authorization: { kind: "solana-message", text: "Sign this enrollment" },
    });
    expect(saved).toMatchObject({
      userId: "user-1",
      slug: "magnificent-seven",
      ownerAccountId: owner,
      strategyId: "strategy-1",
      challenge: { flowId: "flow-1" },
    });
  });

  it("rejects another user's prepared challenge before calling Glider", async () => {
    const service = new BasketService({
      store: store({
        enrollmentIntent: async () => ({
          id: "intent-1",
          userId: "user-2",
          slug: "magnificent-seven",
          ownerAccountId: owner,
          strategyId: "strategy-1",
          challenge: {
            flowId: "flow-1",
            accountIndex: "0",
            agentAccountId: owner,
            message: { kind: "solana-message", text: "Sign this enrollment" },
          },
          expiresAt: new Date(Date.now() + 60_000),
          portfolioId: null,
        }),
      }),
      provider: provider({
        enroll: async () => {
          throw new Error("must not call Glider");
        },
      }),
    });
    await expect(
      service.submitEnrollment("magnificent-seven", "user-1", owner, "intent-1", "signature"),
    ).rejects.toThrow(/authorization/i);
  });
});

it("rebalance submits only a portfolio verified against the signed-in owner and strategy", async () => {
  const triggered: string[] = [];
  const recorded: unknown[] = [];
  const service = new BasketService({
    store: store({
      saveRebalance: async (action: unknown) => {
        recorded.push(action);
      },
    }),
    provider: provider({
      portfolios: async () => [portfolio],
      portfolio: async () => ({ ...portfolio, schedule: null }),
      triggerRebalance: async (id: string) => {
        triggered.push(id);
        return { operationId: "op-1", submittedAt: "2026-10-06T00:00:00Z" };
      },
    }),
  });
  expect(await service.rebalance("magnificent-seven", owner, "user-1")).toMatchObject({
    operationId: "op-1",
  });
  expect(triggered).toEqual(["portfolio-1"]);
  expect(recorded).toMatchObject([{ userId: "user-1", portfolioId: "portfolio-1", operationId: "op-1" }]);
  await expect(service.rebalance("magnificent-seven", `${owner}-other`)).rejects.toMatchObject({
    code: "portfolio_unavailable",
  });
  expect(triggered).toHaveLength(1);
});

it("confirms funding only for the signed-in wallet and this portfolio's destination", async () => {
  const sender = owner.split(":").at(-1)!;
  const destination = portfolio.smartAccounts[0]!.accountId.split(":").at(-1)!;
  const signature = "5".repeat(88);
  const entry = (who: string, rawAmount: bigint) => ({ owner: who, mint: USDC_MINT, rawAmount, decimals: 6 });
  const recorded: unknown[] = [];
  const service = new BasketService({
    store: store({
      confirmFunding: async (input: unknown) => {
        recorded.push(input);
      },
    }),
    provider: provider({ portfolios: async () => [portfolio] }),
    history: {
      tokenAccountsFor: async () => [],
      signatures: async () => [],
      transaction: async () => ({
        signature,
        blockTime: 1_791_270_000,
        succeeded: true,
        accountKeys: [sender, destination],
        feeLamports: 0n,
        preLamports: [],
        postLamports: [],
        preTokens: [entry(sender, 6_000_000n), entry(destination, 0n)],
        postTokens: [entry(sender, 1_000_000n), entry(destination, 5_000_000n)],
      }),
    },
  });
  expect(await service.confirmFunding("magnificent-seven", "user-1", owner, signature)).toMatchObject({
    portfolioId: "portfolio-1",
    amountRaw: "5000000",
  });
  expect(recorded).toMatchObject([{ userId: "user-1", portfolioId: "portfolio-1", amountRaw: 5_000_000n }]);
  await expect(
    service.confirmFunding("magnificent-seven", "user-2", `${owner}-other`, signature),
  ).rejects.toMatchObject({ code: "portfolio_unavailable" });
  expect(recorded).toHaveLength(1);
});
