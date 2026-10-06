import { Hono, type MiddlewareHandler } from "hono";
import {
  ManagedBasketInsights,
  ManagedBasketTemplate,
  ManagedBasketPortfolio,
  ManagedBasketPortfolioSnapshot,
  ManagedBasketOperation,
  PreparedBasketEnrollment,
  SubmitBasketEnrollment,
  PrepareBasketFunding,
  PreparedBasketFunding,
} from "@mercury/types";
import { BasketEnrollmentError, type BasketService } from "../baskets/core/service.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const fail = (code: string, message: string) => ({ error: { code, message } });

const ownerFor = (address: string | null) => (address ? `${SOLANA}:${address}` : null);

export function basketRoutes(service: BasketService, requireBasketAuth: MiddlewareHandler): Hono {
  const app = new Hono();

  const handle = (error: unknown, action = "enrollment") => {
    if (error instanceof BasketEnrollmentError)
      return { status: error.status, body: fail(error.code, error.message) };
    console.error(`Basket ${action} failed:`, error);
    return {
      status: 502 as const,
      body: fail("provider_error", `Basket ${action} is temporarily unavailable.`),
    };
  };

  app.get("/v1/basket-templates", async (c) =>
    c.json({ templates: ManagedBasketTemplate.array().parse(await service.listTemplates()) }),
  );

  app.get("/v1/basket-templates/:slug", async (c) => {
    const template = await service.getTemplate(c.req.param("slug"));
    if (template === null)
      return c.json({ error: { code: "not_found", message: "Unknown basket template." } }, 404);
    return c.json({ template: ManagedBasketTemplate.parse(template) });
  });

  app.get("/v1/basket-templates/:slug/insights", async (c) => {
    const insights = await service.getInsights(c.req.param("slug"));
    if (insights === null)
      return c.json({ error: { code: "not_found", message: "Unknown basket template." } }, 404);
    return c.json({ insights: ManagedBasketInsights.parse(insights) });
  });

  app.get("/v1/basket-templates/:slug/enrollment", requireBasketAuth, async (c) => {
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

  app.get("/v1/basket-templates/:slug/portfolio", requireBasketAuth, async (c) => {
    const owner = ownerFor(c.get("identity").walletAddress);
    if (!owner)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to view a portfolio."), 401);
    try {
      const snapshot = await service.portfolioSnapshot(c.req.param("slug"), owner);
      return c.json({ portfolio: snapshot ? ManagedBasketPortfolioSnapshot.parse(snapshot) : null });
    } catch (error) {
      const result = handle(error, "portfolio read");
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/basket-templates/:slug/operations/:operationId", requireBasketAuth, async (c) => {
    const owner = ownerFor(c.get("identity").walletAddress);
    if (!owner)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to view an operation."), 401);
    try {
      const operation = await service.operation(c.req.param("slug"), owner, c.req.param("operationId"));
      return c.json({ operation: ManagedBasketOperation.parse(operation) });
    } catch (error) {
      const result = handle(error, "operation read");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/enrollment/prepare", requireBasketAuth, async (c) => {
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

  app.post("/v1/basket-templates/:slug/enrollment", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to enroll."), 401);
    const parsed = SubmitBasketEnrollment.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(fail("validation_failed", "A valid enrollment signature is required."), 400);
    try {
      const portfolio = await service.submitEnrollment(
        c.req.param("slug"),
        identity.userId,
        owner,
        parsed.data.intentId,
        parsed.data.signed,
      );
      return c.json({ portfolio: ManagedBasketPortfolio.parse(portfolio) });
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/funding/prepare", requireBasketAuth, async (c) => {
    const owner = ownerFor(c.get("identity").walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to fund a basket."), 401);
    const parsed = PrepareBasketFunding.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Enter a valid USDC amount."), 400);
    try {
      const prepared = await service.prepareFunding(c.req.param("slug"), owner, parsed.data.amountUsd);
      return c.json(PreparedBasketFunding.parse(prepared));
    } catch (error) {
      const result = handle(error, "funding preparation");
      return c.json(result.body, result.status);
    }
  });
  return app;
}
