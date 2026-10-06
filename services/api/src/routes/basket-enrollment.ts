import { Hono } from "hono";
import { ManagedBasketPortfolio, PreparedBasketEnrollment, SubmitBasketEnrollment } from "@mercury/types";
import { BasketEnrollmentError, type BasketService } from "../baskets/core/service.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const fail = (code: string, message: string) => ({ error: { code, message } });

const ownerFor = (address: string | null) => address ? `${SOLANA}:${address}` : null;

export function basketEnrollmentRoutes(service: BasketService): Hono {
  const app = new Hono();

  const handle = (error: unknown) => {
    if (error instanceof BasketEnrollmentError)
      return { status: error.status, body: fail(error.code, error.message) };
    console.error("Basket enrollment failed:", error);
    return { status: 502 as const, body: fail("provider_error", "Glider enrollment is temporarily unavailable.") };
  };

  app.get("/v1/basket-templates/:slug/enrollment", async (c) => {
    const owner = ownerFor(c.get("identity").walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to enroll."), 401);
    try {
      const portfolio = await service.enrollment(c.req.param("slug"), owner);
      return c.json({ portfolio: portfolio ? ManagedBasketPortfolio.parse(portfolio) : null });
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/enrollment/prepare", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to enroll."), 401);
    try {
      const prepared = await service.prepareEnrollment(c.req.param("slug"), identity.userId, owner);
      return c.json(PreparedBasketEnrollment.parse(prepared));
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/enrollment", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to enroll."), 401);
    const parsed = SubmitBasketEnrollment.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "A valid enrollment signature is required."), 400);
    try {
      const portfolio = await service.submitEnrollment(
        c.req.param("slug"), identity.userId, owner, parsed.data.intentId, parsed.data.signed,
      );
      return c.json({ portfolio: ManagedBasketPortfolio.parse(portfolio) });
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });
  return app;
}
