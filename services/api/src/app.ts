import { Hono } from "hono";
import { cors } from "hono/cors";
import { allocate, D, toWire } from "@mercury/core";
import { CreateOrderRequest, InvestBasketRequest } from "@mercury/types";
import type { Deps } from "./deps.js";
import { priceOrder } from "./pricing.js";
import { decisionToWire } from "./serialize.js";
import { BASKETS } from "./baskets.js";
import { requireAuth, type AuthDeps } from "./auth/middleware.js";
import type { ReadDeps } from "./deps.js";
import { activityRoutes } from "./routes/activity.js";
import { instrumentRoutes } from "./routes/instruments.js";
import { moneyRoutes } from "./routes/money.js";
import { portfolioRoutes } from "./routes/portfolio.js";

const fail = (code: string, message: string) => ({ error: { code, message } });

const NOT_READY = fail(
  "not_implemented",
  "Market data is not wired up yet. See subsystem 2 of the backend spec.",
);

/**
 * `market` is a thunk, not a value. Its adapters do not exist until subsystem 2
 * lifts them out of the browser, and evaluating it at boot would stop the auth
 * path from running at all. The routes that need it answer 503 instead.
 */
export function createApp(market: () => Deps, auth: AuthDeps, read: ReadDeps) {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", requireAuth(auth));

  app.onError((err, c) => {
    if (err.message.startsWith("buildDeps:")) return c.json(NOT_READY, 503);
    console.error(err);
    return c.json(fail("internal", "Something went wrong."), 500);
  });

  /** Who is calling, and which wallet is theirs. The first authenticated route. */
  app.get("/v1/me", (c) => c.json(c.get("identity")));

  app.route("/", instrumentRoutes(read.instruments));
  app.route("/", portfolioRoutes(read.portfolio));
  app.route("/", moneyRoutes(read.money));
  app.route("/", activityRoutes(read.activity));

  app.get("/v1/market/status", async (c) => {
    const s = await market().sessions.current();
    return c.json({
      status: s.status,
      isOpen: s.isOpen,
      nextOpenAt: s.nextOpenAt?.toISOString() ?? null,
      nextCloseAt: s.nextCloseAt?.toISOString() ?? null,
      isWeekend: s.isWeekend,
    });
  });

  /** Create an order. Nothing happens on chain: this returns the decision to show the user. */
  app.post("/v1/orders", async (c) => {
    const parsed = CreateOrderRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const decision = await priceOrder(market(), parsed.data);
    if (decision === null) return c.json(fail("not_found", "Unknown instrument."), 404);

    const wire = decisionToWire(decision);
    const saved = await read.orders.create({
      userId: c.get("identity").userId,
      ticker: parsed.data.ticker,
      side: parsed.data.side,
      usdAmount: parsed.data.amount,
      decision: wire,
      chosenMint: wire.kind === "refuse" ? null : wire.best.mint,
      referencePrice: wire.fairPricePerShare,
      premiumPct: wire.kind === "refuse" ? null : wire.premium,
      status: wire.kind === "refuse" ? "refused" : "pending",
    });
    return c.json({ orderId: saved.id, decision: wire });
  });

  app.get("/v1/orders/:id", async (c) => {
    const order = await read.orders.byId(c.get("identity").userId, c.req.param("id"));
    return order === null ? c.json(fail("not_found", "Unknown order."), 404) : c.json(order);
  });

  /** Build the unsigned transaction. The client signs it; we never hold a key. ADR 0003. */
  app.post("/v1/orders/:id/execute", async (c) => {
    const identity = c.get("identity");
    const order = await read.orders.byId(identity.userId, c.req.param("id"));
    if (order === null) return c.json(fail("not_found", "Unknown order."), 404);

    const decision = order.decision as ReturnType<typeof decisionToWire>;
    if (decision.kind === "refuse") return c.json(fail("instrument_not_tradable", decision.detail), 409);

    // The wallet comes from the identity token Privy signed, never from a
    // header the caller controls. See services/api/src/auth/identity.ts.
    const owner = identity.walletAddress;
    if (owner === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    if (decision.best.rejection !== null) {
      return c.json(fail("quote_expired", "The chosen quote is gone. Ask again."), 409);
    }

    const transactions = await market().quotes.buildSwap(order.id, owner);
    await read.orders.setStatus(identity.userId, order.id, "executing");
    return c.json({ transactions, expiresAt: new Date(Date.now() + 30_000).toISOString() });
  });

  app.get("/v1/baskets", (c) =>
    c.json({
      baskets: BASKETS.map((b) => ({
        slug: b.slug,
        name: b.name,
        description: b.description,
        feeBps: b.feeBps,
        minimumUsd: b.minimumUsd,
        capUsd: b.capUsd,
        venue: "symmetry",
        constituents: b.constituents,
      })),
    }),
  );

  /**
   * Run the full decision on every leg without executing. This is what makes the
   * all-or-nothing rule visible before the user commits. See docs/04.
   */
  app.post("/v1/baskets/:slug/preview", async (c) => {
    const basket = BASKETS.find((b) => b.slug === c.req.param("slug"));
    if (basket === undefined) return c.json(fail("not_found", "Unknown basket."), 404);

    const parsed = InvestBasketRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const legs = allocate(D(parsed.data.usdAmount), basket.constituents);
    const priced = await Promise.all(
      legs.map(async (leg) => {
        const decision = await priceOrder(market(), {
          ticker: leg.ticker,
          side: "buy",
          amount: toWire(leg.usdAmount),
        });
        return {
          ticker: leg.ticker,
          usdAmount: toWire(leg.usdAmount),
          decision: decision ? decisionToWire(decision) : null,
        };
      }),
    );

    const refusedLegs = priced
      .filter((l) => l.decision === null || l.decision.kind === "refuse")
      .map((l) => l.ticker);
    const queued = priced.filter((l) => l.decision?.kind === "offer_queue").length;

    return c.json({
      legs: priced,
      refusedLegs,
      // Any refused leg fails the whole basket. We never silently rebalance. docs/04.
      overall: refusedLegs.length > 0 ? "refused" : queued > 0 ? "partial" : "executable",
    });
  });

  app.notFound((c) => c.json(fail("not_found", "No such route."), 404));
  return app;
}
