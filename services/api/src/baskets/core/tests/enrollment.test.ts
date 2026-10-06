import { describe, expect, it } from "vitest";
import { BasketService } from "../service.js";
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
  smartAccounts: [{ accountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk" }],
};

const provider = (changes: Record<string, unknown> = {}) => ({
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

const store = (changes: Record<string, unknown> = {}) => ({
  load: async () => [template],
  withSyncLock: async <T>(work: () => Promise<T>) => work(),
  saveEnrollmentIntent: async () => "intent-1",
  enrollmentIntent: async () => null,
  completeEnrollmentIntent: async () => undefined,
  ...changes,
}) as BasketStore;

describe("basket enrollment", () => {
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
      store: store({ saveEnrollmentIntent: async (intent: unknown) => { saved = intent; return "intent-1"; } }),
      provider: provider(),
    });
    expect(await service.prepareEnrollment("magnificent-seven", "user-1", owner)).toEqual({
      intentId: "intent-1",
      authorization: { kind: "solana-message", text: "Sign this enrollment" },
    });
    expect(saved).toMatchObject({ userId: "user-1", slug: "magnificent-seven", ownerAccountId: owner, strategyId: "strategy-1", challenge: { flowId: "flow-1" } });
  });

  it("rejects another user's prepared challenge before calling Glider", async () => {
    const service = new BasketService({
      store: store({ enrollmentIntent: async () => ({
        id: "intent-1", userId: "user-2", slug: "magnificent-seven", ownerAccountId: owner,
        strategyId: "strategy-1", challenge: { flowId: "flow-1", accountIndex: "0", agentAccountId: owner, message: { kind: "solana-message", text: "Sign this enrollment" } },
        expiresAt: new Date(Date.now() + 60_000), portfolioId: null,
      }) }),
      provider: provider({ enroll: async () => { throw new Error("must not call Glider"); } }),
    });
    await expect(service.submitEnrollment("magnificent-seven", "user-1", owner, "intent-1", "signature")).rejects.toThrow(/authorization/i);
  });
});
