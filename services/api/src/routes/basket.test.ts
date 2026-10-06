import { describe, expect, it } from "vitest";
import { ManagedBasketTemplate } from "@mercury/types";
import { BasketService } from "../baskets/core/service.js";
import { JsonBasketStore } from "../baskets/glider/store.js";
import { basketRoutes } from "./basket.js";

const routes = basketRoutes(
  new BasketService({ store: new JsonBasketStore("postgres://unused") }),
  async (c) => c.json({ error: { code: "unauthenticated" } }, 401),
);

describe("basket template routes", () => {
  it("lists candidate Solana templates without requiring a wallet", async () => {
    const response = await routes.request("/v1/basket-templates");
    const body = (await response.json()) as { templates: unknown };
    const templates = ManagedBasketTemplate.array().parse(body.templates);

    expect(response.status).toBe(200);
    expect(templates).toHaveLength(22);
    expect(templates[0]).toEqual(
      expect.objectContaining({ kind: "managed_portfolio", status: "candidate", canEnroll: true }),
    );
    expect(
      templates.every((template) => {
        const primary = template.tags.filter((tag) => tag.startsWith("theme:") || tag === "shelf:pros");
        return primary.length === 1 && new Set(template.tags).size === template.tags.length;
      }),
    ).toBe(true);
    expect(templates.filter((template) => template.tags.includes("shelf:pros"))).toHaveLength(4);
    expect(templates.filter((template) => template.tags.includes("shelf:featured"))).toHaveLength(6);
    expect(templates.find((template) => template.slug === "magnificent-seven")?.tags).toContain(
      "theme:technology",
    );
  });

  it("returns 404 for an unknown template", async () => {
    const response = await routes.request("/v1/basket-templates/unknown");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Unknown basket template." },
    });
  });

  it("returns the selected template without inventing portfolio returns", async () => {
    const response = await routes.request("/v1/basket-templates/magnificent-seven");
    const body = (await response.json()) as { template: unknown };
    const template = ManagedBasketTemplate.parse(body.template);

    expect(response.status).toBe(200);
    expect(template.strategyId).toBe("01M465MY1C2KBER654KJDCYYK9");
    expect(template.performance).toBeNull();
    expect(template.tags).toContain("theme:technology");
  });
});

describe("authenticated basket enrollment", () => {
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
  expect(observed).toEqual(["magnificent-seven", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet", "user-1"]);
});
