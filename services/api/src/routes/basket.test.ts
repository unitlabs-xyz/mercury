import { actingAs, actingLinked } from "../wallets/testing.js";
import type { Acting } from "../wallets/acting.js";
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
      c.set("acting", { all: false, wallets: [actingAs("VerifiedWallet")] });
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
      c.set("acting", { all: false, wallets: [actingAs("VerifiedWallet")] });
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
    c.set("acting", { all: false, wallets: [actingAs("VerifiedWallet")] });
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
    // The Mercury wallet: sponsored.
    true,
  ]);
});

it("has a linked wallet fund a basket paying its own network fee", async () => {
  let observed: unknown[] = [];
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
    c.set("acting", { all: false, wallets: [actingLinked("PhantomWallet")] });
    await next();
  });
  const response = await app.request("/v1/basket-templates/magnificent-seven/funding/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amountUsd: "12" }),
  });
  expect(response.status).toBe(200);
  expect(observed.at(-1)).toBe(false);
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
    c.set("acting", { all: false, wallets: [actingAs("VerifiedWallet")] });
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
    c.set("acting", { all: false, wallets: [actingAs("VerifiedWallet")] });
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
    // Paid out to the owner itself.
    owner,
  ]);
});

describe("baskets for the wallet chosen", () => {
  const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  const MERCURY = actingAs("MercuryWallet", { id: "w-mercury" });
  const PHANTOM = actingLinked("PhantomWallet", { id: "w-phantom", label: "Phantom" });
  const appFor = (service: BasketService, acting: Acting) =>
    basketRoutes(service, async (c, next) => {
      c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "MercuryWallet" });
      c.set("acting", acting);
      await next();
    });

  it("enrolls a linked wallet as its own basket's owner, never the signed-in Mercury wallet", async () => {
    let owner = "";
    const service = {
      prepareEnrollment: async (_slug: string, _user: string, o: string) => {
        owner = o;
        return { intentId: "i-1", challenge: { kind: "message", message: "sign" } };
      },
    } as unknown as BasketService;
    await appFor(service, { all: false, wallets: [PHANTOM] }).request(
      "/v1/basket-templates/mag7/enrollment/prepare",
      { method: "POST" },
    );
    expect(owner).toBe(`${SOL}:PhantomWallet`);
  });

  it("funds, rebalances and exits as the linked wallet chosen", async () => {
    const owners: string[] = [];
    const record = (o: string) => {
      owners.push(o);
      throw new Error("stop here");
    };
    const service = {
      prepareFunding: async (_s: string, o: string) => record(o),
      rebalance: async (_s: string, o: string) => record(o),
      prepareExit: async (_s: string, o: string) => record(o),
    } as unknown as BasketService;
    const app = appFor(service, { all: false, wallets: [PHANTOM] });
    await app.request("/v1/basket-templates/mag7/funding/prepare", {
      method: "POST",
      body: JSON.stringify({ amountUsd: "20" }),
    });
    await app.request("/v1/basket-templates/mag7/rebalance", { method: "POST" });
    await app.request("/v1/basket-templates/mag7/exit/in_kind/prepare", { method: "POST" });
    expect(owners).toEqual([`${SOL}:PhantomWallet`, `${SOL}:PhantomWallet`, `${SOL}:PhantomWallet`]);
  });

  it("lists every wallet's baskets under every wallet at once, the Mercury wallet's first", async () => {
    const asked: string[] = [];
    const service = {
      ownedPortfolios: async (_u: string, o: string) => {
        asked.push(o);
        return [];
      },
    } as unknown as BasketService;
    const res = await appFor(service, { all: true, wallets: [MERCURY, PHANTOM] }).request(
      "/v1/basket-portfolios",
    );
    expect(res.status).toBe(200);
    expect(asked).toEqual([`${SOL}:MercuryWallet`, `${SOL}:PhantomWallet`]);
  });

  it("asks for one wallet to see or run a single basket under every wallet at once", async () => {
    const service = { portfolioSnapshot: async () => null } as unknown as BasketService;
    const res = await appFor(service, { all: true, wallets: [MERCURY, PHANTOM] }).request(
      "/v1/basket-templates/mag7/portfolio",
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "wallet_all" } });
  });
});

describe("moving a linked wallet's basket into the Mercury wallet", () => {
  const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  const PHANTOM = actingLinked("PhantomWallet", { id: "w-phantom" });
  const MERCURY = actingAs("MercuryWallet", { id: "w-mercury" });
  const appFor = (service: BasketService, chosen = PHANTOM) =>
    basketRoutes(service, async (c, next) => {
      c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "MercuryWallet" });
      c.set("acting", { all: false, wallets: [chosen] });
      await next();
    });
  const message = (recipientAccountId: string) => ({
    portfolioId: "p-1",
    recipientAccountId,
    assets: [{ assetId: "solana:asset", amountRaw: "1" }],
    nonce: `0x${"a".repeat(64)}`,
    expiresAt: 4_000_000_000,
  });

  it("prepares the exit paid out to the person's Mercury wallet, the linked wallet still the owner", async () => {
    let args: unknown[] = [];
    const service = {
      prepareExit: async (...a: unknown[]) => {
        args = a;
        throw new Error("stop");
      },
    } as unknown as BasketService;
    await appFor(service).request("/v1/basket-templates/mag7/exit/in_kind/prepare?to=mercury", {
      method: "POST",
    });
    expect([args[1], args[4]]).toEqual([`${SOL}:PhantomWallet`, `${SOL}:MercuryWallet`]);
  });

  it("refuses a move from the Mercury wallet into itself, and anywhere but the Mercury wallet", async () => {
    const service = { prepareExit: async () => ({}) } as unknown as BasketService;
    const self = await appFor(service, MERCURY).request(
      "/v1/basket-templates/mag7/exit/in_kind/prepare?to=mercury",
      {
        method: "POST",
      },
    );
    expect(self.status).toBe(400);
    const elsewhere = await appFor(service).request(
      "/v1/basket-templates/mag7/exit/in_kind/prepare?to=Attacker",
      {
        method: "POST",
      },
    );
    expect(elsewhere.status).toBe(400);
  });

  it("submits a signed move to the Mercury wallet, and treats any other recipient as the owner, which then fails the terms", async () => {
    const recipients: unknown[] = [];
    const service = {
      submitExit: async (...a: unknown[]) => {
        recipients.push(a[7]);
        throw new Error("stop");
      },
    } as unknown as BasketService;
    const app = appFor(service);
    for (const to of [`${SOL}:MercuryWallet`, `${SOL}:AttackerWallet`]) {
      await app.request("/v1/basket-templates/mag7/exit/in_kind", {
        method: "POST",
        body: JSON.stringify({ message: message(to), signature: "sig" }),
      });
    }
    expect(recipients).toEqual([`${SOL}:MercuryWallet`, `${SOL}:PhantomWallet`]);
  });
});
