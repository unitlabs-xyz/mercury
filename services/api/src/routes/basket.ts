import { Hono } from "hono";
import {
  BasketInsights,
  Basket,
  BasketPortfolio,
  BasketPortfolioSnapshot,
  BasketPortfolioSummary,
  BasketOperation,
  TriggeredBasketRebalance,
  PreparedBasketEnrollment,
  SubmitBasketEnrollment,
  PrepareBasketFunding,
  PreparedBasketFunding,
  ConfirmBasketFunding,
  ConfirmedBasketFunding,
  BasketActivity,
  BasketExitMode,
  PickableBasketAsset,
  PrepareBasketExit,
  PreparedBasketExit,
  SubmitBasketExit,
  SubmittedBasketExit,
} from "@mercury/types";
import { BasketError, type BasketService } from "../baskets/core/service.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const fail = (code: string, message: string) => ({ error: { code, message } });

const ownerFor = (address: string | null) => (address ? `${SOLANA}:${address}` : null);

export function basketRoutes(service: BasketService): Hono {
  const app = new Hono();

  const handle = (error: unknown, action = "enrollment") => {
    if (error instanceof BasketError)
      return { status: error.status, body: fail(error.code, error.message) };
    console.error(`Basket ${action} failed:`, error);
    return {
      status: 502 as const,
      body: fail("provider_error", `Basket ${action} is temporarily unavailable.`),
    };
  };

  app.get("/v1/baskets", async (c) =>
    c.json({ baskets: Basket.array().parse(await service.list(c.get("identity").userId)) }),
  );

  /**
   * What a basket may hold: the same few hundred rows for everybody.
   *
   * Its own top-level collection rather than a child of any basket, because it
   * is the universe a basket is written from and not a part of one.
   */
  app.get("/v1/basket-assets", async (c) =>
    c.json({ assets: PickableBasketAsset.array().parse(await service.pickableAssets()) }),
  );

  app.get("/v1/basket-portfolios", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to view your baskets."), 401);
    try {
      const portfolios = await service.ownedPortfolios(identity.userId, owner);
      return c.json({ portfolios: BasketPortfolioSummary.array().parse(portfolios) });
    } catch (error) {
      const result = handle(error, "portfolio list");
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/baskets/:slug", async (c) => {
    const basket = await service.detail(c.req.param("slug"), c.get("identity").userId);
    if (basket === null) return c.json(fail("not_found", "No such basket."), 404);
    return c.json({ basket: Basket.parse(basket) });
  });

  app.get("/v1/baskets/:slug/insights", async (c) => {
    const insights = await service.insights(c.req.param("slug"), c.get("identity").userId);
    if (insights === null) return c.json(fail("not_found", "No such basket."), 404);
    return c.json({ insights: BasketInsights.parse(insights) });
  });

  app.get("/v1/baskets/:slug/portfolio", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to enroll."), 401);
    try {
      const portfolio = await service.portfolio(c.req.param("slug"), identity.userId, owner);
      return c.json({ portfolio: portfolio ? BasketPortfolio.parse(portfolio) : null });
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/baskets/:slug/portfolio/positions", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to view a portfolio."), 401);
    try {
      const snapshot = await service.positions(c.req.param("slug"), identity.userId, owner);
      return c.json({ portfolio: snapshot ? BasketPortfolioSnapshot.parse(snapshot) : null });
    } catch (error) {
      const result = handle(error, "portfolio read");
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/baskets/:slug/operations/:operationId", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to view an operation."), 401);
    try {
      const operation = await service.operation(
        c.req.param("slug"),
        identity.userId,
        owner,
        c.req.param("operationId"),
      );
      return c.json({ operation: BasketOperation.parse(operation) });
    } catch (error) {
      const result = handle(error, "operation read");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/baskets/:slug/rebalance", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to rebalance."), 401);
    try {
      const triggered = await service.rebalance(c.req.param("slug"), identity.userId, owner);
      return c.json(TriggeredBasketRebalance.parse(triggered), 202);
    } catch (error) {
      const result = handle(error, "rebalance");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/baskets/:slug/exit/:mode/prepare", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to exit a basket."), 401);
    const mode = BasketExitMode.safeParse(c.req.param("mode"));
    if (!mode.success) return c.json(fail("validation_failed", "Choose an in-kind or USDC exit."), 400);
    const request = await c.req.json().catch(() => null);
    const selection = request === null ? null : PrepareBasketExit.safeParse(request);
    if (selection && !selection.success)
      return c.json(fail("validation_failed", "Choose at least one valid asset amount."), 400);
    try {
      return c.json(
        PreparedBasketExit.parse(
          await service.prepareExit(
            c.req.param("slug"),
            identity.userId,
            owner,
            mode.data,
            selection?.data.assets,
          ),
        ),
      );
    } catch (error) {
      const result = handle(error, "exit preparation");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/baskets/:slug/exit/:mode/submit", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to exit a basket."), 401);
    const mode = BasketExitMode.safeParse(c.req.param("mode"));
    const body = SubmitBasketExit.safeParse(await c.req.json().catch(() => null));
    if (!mode.success || !body.success)
      return c.json(fail("validation_failed", "A valid signed exit authorization is required."), 400);
    try {
      return c.json(
        SubmittedBasketExit.parse(
          await service.submitExit(
            c.req.param("slug"),
            identity.userId,
            owner,
            mode.data,
            body.data.message,
            body.data.signature,
            body.data.submission,
          ),
        ),
        202,
      );
    } catch (error) {
      const result = handle(error, "exit submission");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/baskets/:slug/enrollment/prepare", async (c) => {
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

  app.post("/v1/baskets/:slug/enrollment/submit", async (c) => {
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
      return c.json({ portfolio: BasketPortfolio.parse(portfolio) });
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/baskets/:slug/funding/prepare", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to fund a basket."), 401);
    const parsed = PrepareBasketFunding.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Enter a valid USDC amount."), 400);
    try {
      const prepared = await service.prepareFunding(
        c.req.param("slug"),
        identity.userId,
        owner,
        parsed.data.amountUsd,
      );
      return c.json(PreparedBasketFunding.parse(prepared));
    } catch (error) {
      const result = handle(error, "funding preparation");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/baskets/:slug/funding/confirm", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to confirm funding."), 401);
    const parsed = ConfirmBasketFunding.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "A Solana signature is required."), 400);
    try {
      return c.json(
        ConfirmedBasketFunding.parse(
          await service.confirmFunding(c.req.param("slug"), identity.userId, owner, parsed.data.signature),
        ),
      );
    } catch (error) {
      const result = handle(error, "funding confirmation");
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/baskets/:slug/activity", async (c) => {
    const identity = c.get("identity");
    const owner = ownerFor(identity.walletAddress);
    if (!owner) return c.json(fail("wallet_required", "Sign in with a Solana wallet to view activity."), 401);
    try {
      return c.json({
        activity: BasketActivity.array().parse(
          await service.activity(c.req.param("slug"), identity.userId, owner),
        ),
      });
    } catch (error) {
      const result = handle(error, "activity read");
      return c.json(result.body, result.status);
    }
  });
  return app;
}
