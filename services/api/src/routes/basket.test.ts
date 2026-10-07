import { describe, expect, it } from "vitest";
import { BasketService } from "../baskets/core/service.js";
import { basketRoutes } from "./basket.js";

describe("authenticated basket enrollment", () => {
  it("scopes the landing list to the verified wallet, not a request parameter", async () => {
    let observed: unknown;
    const service = {
      ownedPortfolios: async (...args: unknown[]) => {
        observed = args;
        return [];
      },
    } as unknown as BasketService;
    const app = basketRoutes(service, async (c, next) => {
      c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" });
      await next();
    });
    const response = await app.request("/v1/basket-portfolios?ownerAccountId=AttackerWallet");
    expect(response.status).toBe(200);
    expect(observed).toEqual(["user-1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet"]);
    expect(await response.json()).toEqual({ portfolios: [] });
  });

  it("uses the verified wallet for enrollment lookup, never a requested owner", async () => {
    let lookedUpOwner = "";
    const service = {
      enrollment: async (_slug: string, owner: string) => {
        lookedUpOwner = owner;
        return null;
      },
    } as BasketService;
    const app = basketRoutes(service, async (c, next) => {
      c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" });
      await next();
    });
    const response = await app.request(
      "/v1/basket-templates/magnificent-seven/enrollment?ownerAccountId=AttackerWallet",
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
  const app = basketRoutes(service, async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" });
    await next();
  });
  const response = await app.request("/v1/basket-templates/magnificent-seven/funding/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amountUsd: "12", destinationAccountId: "AttackerWallet" }),
  });
  expect(response.status).toBe(200);
  expect(observed).toEqual([
    "magnificent-seven",
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
  const app = basketRoutes(service, async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" });
    await next();
  });
  const response = await app.request("/v1/basket-templates/magnificent-seven/rebalance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ portfolioId: "attacker-portfolio" }),
  });
  expect(response.status).toBe(202);
  expect(observed).toEqual([
    "magnificent-seven",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet",
    "user-1",
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
  const app = basketRoutes(service, async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" });
    await next();
  });
  const response = await app.request(
    "/v1/basket-templates/magnificent-seven/exit/in_kind/prepare?recipientAccountId=AttackerWallet",
    {
      method: "POST",
      body: JSON.stringify({ assets: [{ assetId: "solana:asset", amountRaw: "1" }] }),
    },
  );
  expect(response.status).toBe(200);
  expect(observed).toEqual([
    "magnificent-seven",
    owner,
    "in_kind",
    [{ assetId: "solana:asset", amountRaw: "1" }],
  ]);
});
