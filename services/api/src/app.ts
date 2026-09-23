import { Hono } from "hono";
import { cors } from "hono/cors";
import { allocate, D, toWire } from "@harbor/core";
import { CreateOrderRequest, InvestBasketRequest } from "@harbor/types";
import type { Deps } from "./deps.js";
import { priceOrder } from "./pricing.js";
import { decisionToWire } from "./serialize.js";
import { BASKETS } from "./baskets.js";
import { requireAuth, type AuthDeps } from "./auth/middleware.js";

interface StoredOrder {
  id: string;
  decision: ReturnType<typeof decisionToWire>;
  status: "pending" | "executing" | "filled" | "queued" | "refused";
  createdAt: string;
}

/** In memory until the Postgres schema lands in week two. See docs/05. */
const orders = new Map<string, StoredOrder>();

// TODO week 2: Postgres, per docs/05. Instrument routes rebuild against deps.registry.

const fail = (code: string, message: string) => ({ error: { code, message } });

export function createApp(deps: Deps, auth: AuthDeps) {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", requireAuth(auth));

  /** Who is calling, and which wallet is theirs. The first authenticated route. */
  app.get("/v1/me", (c) => c.json(c.get("identity")));

  app.get("/v1/market/status", async (c) => {
    const s = await deps.sessions.current();
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

    const decision = await priceOrder(deps, parsed.data);
    if (decision === null) return c.json(fail("not_found", "Unknown instrument."), 404);

    const wire = decisionToWire(decision);
    const id = crypto.randomUUID();
    orders.set(id, {
      id,
      decision: wire,
      status: wire.kind === "refuse" ? "refused" : "pending",
      createdAt: new Date().toISOString(),
    });
    return c.json({ orderId: id, decision: wire });
  });

  app.get("/v1/orders/:id", (c) => {
    const o = orders.get(c.req.param("id"));
    return o ? c.json(o) : c.json(fail("not_found", "Unknown order."), 404);
  });

  /** Build the unsigned transaction. The client signs it; we never hold a key. ADR 0003. */
  app.post("/v1/orders/:id/execute", async (c) => {
    const o = orders.get(c.req.param("id"));
    if (o === undefined) return c.json(fail("not_found", "Unknown order."), 404);
    if (o.decision.kind === "refuse") return c.json(fail("instrument_not_tradable", o.decision.detail), 409);

    const owner = c.req.header("x-wallet-address");
    if (owner === undefined) return c.json(fail("unauthorized", "No wallet on the request."), 401);

    const quoteId = o.decision.best.rejection === null ? o.decision.best.mint : null;
    if (quoteId === null) return c.json(fail("quote_expired", "The chosen quote is gone. Ask again."), 409);

    const transactions = await deps.quotes.buildSwap(`${o.id}`, owner);
    o.status = "executing";
    return c.json({ transactions, expiresAt: new Date(Date.now() + 30_000).toISOString() });
  });

  app.get("/v1/baskets", (c) =>
    c.json({
      baskets: BASKETS.map((b) => ({
        slug: b.slug, name: b.name, description: b.description,
        feeBps: b.feeBps, minimumUsd: b.minimumUsd, capUsd: b.capUsd, venue: "symmetry",
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
        const decision = await priceOrder(deps, { ticker: leg.ticker, side: "buy", amount: toWire(leg.usdAmount) });
        return { ticker: leg.ticker, usdAmount: toWire(leg.usdAmount), decision: decision ? decisionToWire(decision) : null };
      }),
    );

    const refusedLegs = priced.filter((l) => l.decision === null || l.decision.kind === "refuse").map((l) => l.ticker);
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
