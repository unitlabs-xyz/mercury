import { describe, expect, it } from "vitest";
import type { BasketProvider, BasketStore } from "../baskets/core/deps.js";
import { basketReturnsReader, basketValueReader } from "./baskets.js";

const WALLET = "Wa11et00000000000000000000000000000000";
const OWNER = `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${WALLET}`;
const SMART = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:SmartAccount0000000000000000000000000";
const store = {
  load: async () => [],
  completedEnrollments: async () => [],
} as unknown as BasketStore;

const provider = (warning = false): BasketProvider =>
  ({
    portfoliosForOwner: async () => [
      {
        portfolioId: "p1",
        ownerAccountId: OWNER,
        strategyId: "strategy-1",
        smartAccounts: [{ accountId: SMART }],
      },
    ],
    positions: async () => ({
      portfolioId: "p1",
      totalValueUsd: "35",
      inTransitUsd: "1",
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      assets: [
        {
          assetId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          smartAccountId: SMART,
          symbol: "USDC",
          decimals: 6,
          balance: "34",
          balanceRaw: "34000000",
          priceUsd: "1",
          valueUsd: "34",
        },
      ],
      warnings: warning ? [{ kind: "RPC_ERROR" as const, message: "partial" }] : [],
    }),
  }) as unknown as BasketProvider;

describe("basket valuation", () => {
  it("uses Glider's cached value, but rejects a partial positions response", async () => {
    const valid = await basketValueReader(provider(), store)("user-1", WALLET);
    expect(valid.totalUsd.toString()).toBe("35");
    expect(valid.baskets[0]?.inTransitUsd).toBe("1");
    await expect(basketValueReader(provider(true), store)("user-1", WALLET)).rejects.toMatchObject({
      code: "basket_value_unavailable",
    });
  });
});

it("reads the owned portfolio's money-weighted return without relying on its position value", async () => {
  const glider = {
    ...provider(),
    portfolioReturn: async (id: string) => (id === "p1" ? "2.5" : null),
  } as BasketProvider;
  expect(await basketReturnsReader(glider)(WALLET)).toEqual([{ portfolioId: "p1", percentChange: "2.5" }]);
  await expect(basketReturnsReader(glider)("AnotherWallet")).rejects.toMatchObject({
    code: "basket_value_unavailable",
  });
});
