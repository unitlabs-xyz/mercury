import { Hono, type Context, type MiddlewareHandler } from "hono";
import { logger } from "../log/index.js";
import {
  ManagedBasketInsights,
  ManagedBasketTemplate,
  ManagedBasketPortfolio,
  ManagedBasketPortfolioSnapshot,
  ManagedBasketPortfolioSummary,
  ManagedBasketOperation,
  TriggeredBasketRebalance,
  PreparedBasketEnrollment,
  SubmitBasketEnrollment,
  PrepareBasketFunding,
  PreparedBasketFunding,
  ConfirmBasketFunding,
  ConfirmedBasketFunding,
  ManagedBasketActivity,
  BasketExitMode,
  PrepareBasketExit,
  PreparedBasketExit,
  SubmitBasketExit,
  SubmittedBasketExit,
} from "@mercury/types";
import { BasketEnrollmentError, type BasketService } from "../baskets/core/service.js";
// Loads the ContextVariableMap declarations so `c.get("identity")` and `c.get("acting")` are typed.
import type {} from "../auth/middleware.js";
import { writerOf } from "../wallets/acting.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const fail = (code: string, message: string) => ({ error: { code, message } });

const ownerFor = (address: string | null) => (address ? `${SOLANA}:${address}` : null);

/**
 * The basket owner a request is for: the wallet chosen, the Mercury wallet or
 * a linked one. A linked wallet owns its own baskets under Mercury's Glider
 * account, approving each step in its own app, as Glider's Solana-rooted
 * owners do. Null for every wallet at once, and while the Mercury wallet is
 * still being made.
 */
const ownerOf = (c: Context) => ownerFor(writerOf(c)?.address ?? null);

/** Why there is no owner: every wallet at once is a choice to make; no wallet at all is a sign-in. */
const noOwner = (c: Context, signIn: string) =>
  c.get("acting").all
    ? c.json(fail("wallet_all", "Choose a wallet to see or run a basket."), 400)
    : c.json(fail("wallet_required", signIn), 401);

const log = logger("baskets");

export function basketRoutes(service: BasketService, requireBasketAuth: MiddlewareHandler): Hono {
  const app = new Hono();

  const handle = (error: unknown, action = "enrollment") => {
    if (error instanceof BasketEnrollmentError)
      return { status: error.status, body: fail(error.code, error.message) };
    log.error({ action, err: error }, "basket operation failed");
    return {
      status: 502 as const,
      body: fail("provider_error", `Basket ${action} is temporarily unavailable.`),
    };
  };

  app.get("/v1/basket-templates", async (c) =>
    c.json({ templates: ManagedBasketTemplate.array().parse(await service.listTemplates()) }),
  );

  app.get("/v1/basket-portfolios", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const acting = c.get("acting");
    // Every wallet at once: each one's baskets, the Mercury wallet's first.
    const owners = acting.all
      ? acting.wallets.flatMap((w) => {
          const o = ownerFor(w.isPrimary ? identity.walletAddress : w.address);
          return o === null ? [] : [o];
        })
      : [ownerOf(c)].filter((o): o is string => o !== null);
    if (owners.length === 0)
      return c.json(fail("wallet_required", "Sign in with a Solana wallet to view your baskets."), 401);
    try {
      const portfolios = (
        await Promise.all(owners.map((owner) => service.ownedPortfolios(identity.userId, owner)))
      ).flat();
      return c.json({ portfolios: ManagedBasketPortfolioSummary.array().parse(portfolios) });
    } catch (error) {
      const result = handle(error, "portfolio list");
      return c.json(result.body, result.status);
    }
  });

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
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to enroll.");
    try {
      const portfolio = await service.enrollment(c.req.param("slug"), owner);
      return c.json({ portfolio: portfolio ? ManagedBasketPortfolio.parse(portfolio) : null });
    } catch (error) {
      const result = handle(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/basket-templates/:slug/portfolio", requireBasketAuth, async (c) => {
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to view a portfolio.");
    try {
      const snapshot = await service.portfolioSnapshot(c.req.param("slug"), owner);
      return c.json({ portfolio: snapshot ? ManagedBasketPortfolioSnapshot.parse(snapshot) : null });
    } catch (error) {
      const result = handle(error, "portfolio read");
      return c.json(result.body, result.status);
    }
  });

  app.get("/v1/basket-templates/:slug/operations/:operationId", requireBasketAuth, async (c) => {
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to view an operation.");
    try {
      const operation = await service.operation(c.req.param("slug"), owner, c.req.param("operationId"));
      return c.json({ operation: ManagedBasketOperation.parse(operation) });
    } catch (error) {
      const result = handle(error, "operation read");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/rebalance", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to rebalance.");
    try {
      const triggered = await service.rebalance(c.req.param("slug"), owner, identity.userId);
      return c.json(TriggeredBasketRebalance.parse(triggered), 202);
    } catch (error) {
      const result = handle(error, "rebalance");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/exit/:mode/prepare", requireBasketAuth, async (c) => {
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to exit a basket.");
    const mode = BasketExitMode.safeParse(c.req.param("mode"));
    if (!mode.success) return c.json(fail("validation_failed", "Choose an in-kind or USDC exit."), 400);
    const request = await c.req.json().catch(() => null);
    const selection = request === null ? null : PrepareBasketExit.safeParse(request);
    if (selection && !selection.success)
      return c.json(fail("validation_failed", "Choose at least one valid asset amount."), 400);
    // `?to=mercury`: a linked wallet's basket paid out straight into the person's Mercury wallet.
    const to = c.req.query("to");
    if (to !== undefined && to !== "mercury")
      return c.json(fail("validation_failed", "A basket can only be moved to your Mercury wallet."), 400);
    const mercury = ownerFor(c.get("identity").walletAddress);
    if (to === "mercury" && (mercury === null || mercury === owner))
      return c.json(fail("validation_failed", "Choose a linked wallet's basket to move it here."), 400);
    try {
      return c.json(
        PreparedBasketExit.parse(
          await service.prepareExit(
            c.req.param("slug"),
            owner,
            mode.data,
            selection?.data.assets,
            to === "mercury" ? mercury! : owner,
          ),
        ),
      );
    } catch (error) {
      const result = handle(error, "exit preparation");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/exit/:mode", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to exit a basket.");
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
            // Paid out to the owner, or moved to the person's own Mercury wallet: never anywhere else.
            body.data.message.recipientAccountId === ownerFor(identity.walletAddress)
              ? body.data.message.recipientAccountId
              : owner,
          ),
        ),
        202,
      );
    } catch (error) {
      const result = handle(error, "exit submission");
      return c.json(result.body, result.status);
    }
  });

  app.post("/v1/basket-templates/:slug/enrollment/prepare", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to enroll.");
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
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to enroll.");
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
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to fund a basket.");
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

  app.post("/v1/basket-templates/:slug/funding/confirm", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to confirm funding.");
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

  app.get("/v1/basket-templates/:slug/activity", requireBasketAuth, async (c) => {
    const identity = c.get("identity");
    const owner = ownerOf(c);
    if (!owner) return noOwner(c, "Sign in with a Solana wallet to view activity.");
    try {
      return c.json({
        activity: ManagedBasketActivity.array().parse(
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
