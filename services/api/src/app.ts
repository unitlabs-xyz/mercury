import { Hono } from "hono";
import { cors } from "hono/cors";
import { allocate, D, DEFAULT_POLICY, toWire } from "@mercury/core";
import { CreateOrderRequest, InvestBasketRequest, type ErrorCode } from "@mercury/types";
import type { Deps } from "./deps.js";
import { priceOrder } from "./pricing.js";
import { gateExecution } from "./orders/gate.js";
import { decisionToWire } from "./serialize.js";
import { BASKETS } from "./baskets.js";
import { requireAuth, type AuthDeps } from "./auth/middleware.js";
import type { ReadDeps } from "./deps.js";
import { activityRoutes } from "./routes/activity.js";
import { borrowRoutes } from "./routes/borrow.js";
import { sendRoutes } from "./routes/send.js";
import { instrumentRoutes } from "./routes/instruments.js";
import { moneyRoutes } from "./routes/money.js";
import { portfolioRoutes } from "./routes/portfolio.js";

const fail = (code: ErrorCode | "not_implemented", message: string, details?: unknown) => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

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

  // Public, so the app can say "dry run" before anyone signs anything.
  app.get("/health", (c) => c.json({ ok: true, sendMode: read.send.mode ?? "broadcast" }));

  // Market data is public: the shelf and a stock page read the same for anyone,
  // and a visitor browsing before signing in should see prices. Registered ahead
  // of the auth middleware, which only guards the routes after it.
  app.route("/", instrumentRoutes(read.instruments));

  app.use("/v1/*", requireAuth(auth));

  app.onError((err, c) => {
    if (err.message.startsWith("buildDeps:")) return c.json(NOT_READY, 503);
    console.error(err);
    return c.json(fail("internal", "Something went wrong."), 500);
  });

  /** Who is calling, and which wallet is theirs. The first authenticated route. */
  app.get("/v1/me", (c) => c.json(c.get("identity")));
  app.route("/", portfolioRoutes(read.portfolio));
  app.route("/", moneyRoutes(read.money));
  app.route("/", activityRoutes(read.activity));
  app.route("/", borrowRoutes(read.borrow));
  app.route("/", sendRoutes(read.send));

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

  /**
   * Build the unsigned transaction. The client signs it; we never hold a key. ADR 0003.
   *
   * Every guard runs again here, against a quote fetched in this request. The
   * decision on the order row is what the user was shown, and by the time they
   * have confirmed and their wallet is ready to sign it is anywhere from
   * seconds to minutes old — the reference price behind it is allowed to be
   * five minutes stale on its own. Pricing once and building later would mean
   * the premium check was run on a number that never filled.
   *
   * So the stored decision is used for exactly one thing: what the user agreed
   * to, which is what the drift check measures against. Everything that
   * actually gates the order — staleness, halts, price impact, premium — is
   * decided on the quote that the transaction is then built from.
   */
  app.post("/v1/orders/:id/execute", async (c) => {
    const identity = c.get("identity");
    const order = await read.orders.byId(identity.userId, c.req.param("id"));
    if (order === null) return c.json(fail("not_found", "Unknown order."), 404);

    const shown = order.decision as ReturnType<typeof decisionToWire>;
    if (shown.kind === "refuse") return c.json(fail("instrument_not_tradable", shown.detail), 409);

    // The wallet comes from the identity token Privy signed, never from a
    // header the caller controls. See services/api/src/auth/identity.ts.
    const owner = identity.walletAddress;
    if (owner === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    /*
     * Settled orders cannot be built again; unsettled ones can.
     *
     * `executing` here means a transaction was handed over, not that one was
     * signed — the wallet dialog can be closed, and that user should be able to
     * ask again rather than be told their order is in flight when nothing is.
     * What must never be rebuilt is an order that already reached an end: the
     * unique index on `tx_signature` is the backstop once a fill is recorded.
     */
    if (order.status === "filled" || order.status === "cancelled" || order.status === "refused") {
      return c.json(fail("instrument_not_tradable", `This order is already ${order.status}.`), 409);
    }

    const fresh = await priceOrder(market(), {
      ticker: shown.ticker,
      side: shown.side,
      amount: shown.amount,
    });
    if (fresh === null) return c.json(fail("not_found", "Unknown instrument."), 404);
    const wire = decisionToWire(fresh);

    // The row ends up holding the decision that was acted on, never the one
    // that was merely displayed. Whatever happens below, this is what is stored.
    const record = (status: "pending" | "executing" | "refused") =>
      read.orders.reprice(identity.userId, order.id, {
        decision: wire,
        chosenMint: wire.kind === "refuse" ? null : wire.best.mint,
        referencePrice: wire.fairPricePerShare,
        premiumPct: wire.kind === "refuse" ? null : wire.premium,
        status,
      });

    const gate = gateExecution({
      shownPricePerShare: shown.best.pricePerShare,
      fresh,
      maxQuoteDriftBps: DEFAULT_POLICY.maxQuoteDriftBps,
    });

    if (gate.kind === "refuse") {
      await record("refused");
      return c.json(fail("instrument_not_tradable", gate.detail, { decision: wire }), 409);
    }

    if (gate.kind === "moved") {
      // Still pending: the order was never sent, and the same intent can be
      // confirmed again against the price now on screen.
      await record("pending");
      return c.json(
        fail("price_moved", gate.detail, {
          wasPricePerShare: shown.best.pricePerShare,
          adverseBps: gate.adverseBps === null ? null : gate.adverseBps.toFixed(1),
          decision: wire,
        }),
        409,
      );
    }

    /* v8 ignore next 3 -- `decide` never returns execute without a best quote;
       the narrowing exists because the type allows what the code does not. */
    if (fresh.kind !== "execute") {
      return c.json(fail("internal", "The order could not be built."), 500);
    }

    const transactions = await market().quotes.buildSwap(
      { quoteId: fresh.best.quoteId, raw: fresh.best.quoteRaw },
      owner,
    );
    await record("executing");
    return c.json({
      transactions,
      decision: wire,
      // The quote behind this transaction, not a round number: Jupiter's keyless
      // quotes hold for twenty seconds and the decision was made on one of them.
      expiresAt: new Date(fresh.decidedAt.getTime() + 20_000).toISOString(),
    });
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
