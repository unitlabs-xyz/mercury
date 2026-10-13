import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { BasketService } from "../baskets/core/service.js";
import { basketRoutes } from "./basket.js";

/** The app as it is mounted: every basket route sits behind the auth guard. */
const signedIn = (service: BasketService, identity: Record<string, unknown>) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", identity as never);
    await next();
  });
  app.route("/", basketRoutes(service));
  return app;
};

describe("authenticated basket enrollment", () => {
  it("scopes the landing list to the verified wallet, not a request parameter", async () => {
    let observed: unknown;
    const service = {
      ownedPortfolios: async (...args: unknown[]) => {
        observed = args;
        return [];
      },
    } as unknown as BasketService;
    const app = signedIn(service, {
      userId: "user-1",
      privyUserId: "did:privy:1",
      walletAddress: "VerifiedWallet",
    });
    const response = await app.request("/v1/basket-portfolios?ownerAccountId=AttackerWallet");
    expect(response.status).toBe(200);
    expect(observed).toEqual(["user-1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet"]);
    expect(await response.json()).toEqual({ portfolios: [] });
  });

  it("uses the verified wallet for the portfolio lookup, never a requested owner", async () => {
    let lookedUpOwner = "";
    const service = {
      portfolio: async (_slug: string, _userId: string, owner: string) => {
        lookedUpOwner = owner;
        return null;
      },
    } as unknown as BasketService;
    const app = signedIn(service, {
      userId: "user-1",
      privyUserId: "did:privy:1",
      walletAddress: "VerifiedWallet",
    });
    const response = await app.request(
      "/v1/baskets/magnificent-seven/portfolio?ownerAccountId=AttackerWallet",
    );
    expect(response.status).toBe(200);
    expect(lookedUpOwner).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet");
  });
});

it("prepares funding for the verified wallet and ignores a client-supplied destination", async () => {
  let observed: unknown;
  const service = {
    prepareFunding: async (...args: unknown[]) => {
      observed = args;
      return {
        portfolioId: "portfolio-1",
        destinationAccountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:Vault",
        amountRaw: "12000000",
        transaction: "unsigned",
        expiresAt: "2026-10-06T12:00:00.000Z",
      };
    },
  } as BasketService;
  const app = signedIn(service, {
    userId: "user-1",
    privyUserId: "did:privy:1",
    walletAddress: "VerifiedWallet",
  });
  const response = await app.request("/v1/baskets/magnificent-seven/funding/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amountUsd: "12", destinationAccountId: "AttackerWallet" }),
  });
  expect(response.status).toBe(200);
  expect(observed).toEqual([
    "magnificent-seven",
    "user-1",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet",
    "12",
  ]);
});

it("submits rebalance for the verified wallet without accepting a client portfolio ID", async () => {
  let observed: unknown;
  const service = {
    rebalance: async (...args: unknown[]) => {
      observed = args;
      return { operationId: "op-1", submittedAt: "2026-10-06T00:00:00Z" };
    },
  } as BasketService;
  const app = signedIn(service, {
    userId: "user-1",
    privyUserId: "did:privy:1",
    walletAddress: "VerifiedWallet",
  });
  const response = await app.request("/v1/baskets/magnificent-seven/rebalance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ portfolioId: "attacker-portfolio" }),
  });
  expect(response.status).toBe(202);
  expect(observed).toEqual([
    "magnificent-seven",
    "user-1",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet",
  ]);
});

it("prepares withdrawal for the session wallet, never a client-supplied recipient", async () => {
  let observed: unknown;
  const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet";
  const service = {
    prepareExit: async (...args: unknown[]) => {
      observed = args;
      return {
        mode: "in_kind",
        submission: "withdraw",
        portfolioId: "p-1",
        recipientAccountId: owner,
        expiresAt: "2026-10-07T00:00:00Z",
        authorization: { kind: "solana-message", text: "Sign exit" },
        message: {
          portfolioId: "p-1",
          recipientAccountId: owner,
          assets: [{ assetId: "solana:asset", amountRaw: "1" }],
          nonce: `0x${"a".repeat(64)}`,
          expiresAt: 9999999999,
        },
      };
    },
  } as BasketService;
  const app = signedIn(service, {
    userId: "user-1",
    privyUserId: "did:privy:1",
    walletAddress: "VerifiedWallet",
  });
  const response = await app.request(
    "/v1/baskets/magnificent-seven/exit/in_kind/prepare?recipientAccountId=AttackerWallet",
    {
      method: "POST",
      body: JSON.stringify({ assets: [{ assetId: "solana:asset", amountRaw: "1" }] }),
    },
  );
  expect(response.status).toBe(200);
  expect(observed).toEqual([
    "magnificent-seven",
    "user-1",
    owner,
    "in_kind",
    [{ assetId: "solana:asset", amountRaw: "1" }],
  ]);
});

describe("writing a basket somebody owns", () => {
  const identity = { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" };

  it("creates for the signed-in user, never a requested one", async () => {
    let observed: unknown;
    const app = signedIn(
      {
        create: async (...args: unknown[]) => {
          observed = args;
          return {
            source: "mine",
            slug: "my-ai-bet-7fq2kx9m",
            name: "My AI Bet",
            description: "",
            strategyId: "strategy-1",
            createdAt: "2026-10-13T00:00:00.000Z",
            updatedAt: "2026-10-13T00:00:00.000Z",
            schedule: { type: "interval", frequency: "daily" },
            allocations: [{ ticker: "NVDA", mint: "m", assetId: "solana:x/spl:m", weightBps: 10_000 }],
            performance: null,
          };
        },
      } as unknown as BasketService,
      identity,
    );
    const response = await app.request("/v1/baskets", {
      method: "POST",
      body: JSON.stringify({
        userId: "user-2",
        name: "My AI Bet",
        assets: [{ assetId: "solana:x/spl:m", weightBps: 10_000 }],
      }),
    });
    expect(response.status).toBe(201);
    expect(observed).toEqual([
      "user-1",
      { name: "My AI Bet", description: "", assets: [{ assetId: "solana:x/spl:m", weightBps: 10_000 }] },
    ]);
  });

  // Deleting checks what the basket still holds, and that read is wallet-scoped.
  it("deletes against the verified wallet, never a requested owner", async () => {
    let observed: unknown;
    const app = signedIn(
      {
        remove: async (...args: unknown[]) => {
          observed = args;
        },
      } as unknown as BasketService,
      identity,
    );
    const response = await app.request("/v1/baskets/mine-7fq2kx9m?ownerAccountId=AttackerWallet", {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(observed).toEqual([
      "user-1",
      "mine-7fq2kx9m",
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet",
    ]);
  });

  it("refuses a change that changes nothing", async () => {
    const app = signedIn({} as BasketService, identity);
    const response = await app.request("/v1/baskets/mine-7fq2kx9m", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});
