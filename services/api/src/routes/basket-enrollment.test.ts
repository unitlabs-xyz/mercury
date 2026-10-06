import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { BasketService } from "../baskets/core/service.js";
import { basketEnrollmentRoutes } from "./basket-enrollment.js";

describe("authenticated basket enrollment", () => {
  it("uses the verified wallet for enrollment lookup, never a requested owner", async () => {
    let lookedUpOwner = "";
    const service = {
      enrollment: async (_slug: string, owner: string) => { lookedUpOwner = owner; return null; },
    } as BasketService;
    const app = new Hono();
    app.use("/v1/*", async (c, next) => {
      c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "VerifiedWallet" });
      await next();
    });
    app.route("/", basketEnrollmentRoutes(service));
    const response = await app.request("/v1/basket-templates/magnificent-seven/enrollment?ownerAccountId=AttackerWallet");
    expect(response.status).toBe(200);
    expect(lookedUpOwner).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:VerifiedWallet");
  });
});
