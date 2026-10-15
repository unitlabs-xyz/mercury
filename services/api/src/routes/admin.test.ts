import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { adminRoutes, ranged, type AdminDeps } from "./admin.js";
import type { Freshness } from "../admin/freshness.js";

const NOTHING: Freshness = {
  snapshotAt: null,
  priceBarAt: null,
  activityAt: null,
  now: "2026-10-15T00:00:00.000Z",
};

/** Every query stubbed; the authorisation tests need no database at all. */
const STUBS = {
  health: async () => NOTHING,
  overview: async () => ({}) as never,
  orders: async () => ({}) as never,
  funding: async () => ({}) as never,
  baskets: async () => ({}) as never,
} satisfies Omit<AdminDeps, "admins">;

/** An app with the identity already set, as requireAuth would leave it. */
const appAs = (privyUserId: string, admins: readonly string[], deps: Partial<AdminDeps> = {}) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "u1", privyUserId, walletAddress: null });
    await next();
  });
  app.route("/", adminRoutes({ admins, ...STUBS, ...deps }));
  return app;
};

/** Every route this surface exposes. New routes join this list or go ungated. */
const ROUTES = [
  "/v1/admin/health",
  "/v1/admin/overview",
  "/v1/admin/orders",
  "/v1/admin/funding",
  "/v1/admin/baskets",
] as const;

describe("admin routes", () => {
  it.each(ROUTES)("answers 404 on %s to a caller who is not an admin", async (route) => {
    /* 404 and not 403: a 403 confirms the surface exists. It reads every
       account's holdings, so there is no reason to advertise it. Every route,
       because a gate that covers four of five is not a gate. */
    const app = appAs("did:privy:nobody", ["did:privy:me"]);

    expect((await app.request(route)).status).toBe(404);
  });

  it.each(ROUTES)("answers 404 on %s when the allowlist is empty", async (route) => {
    const app = appAs("did:privy:me", []);

    expect((await app.request(route)).status).toBe(404);
  });

  it.each(ROUTES)("exposes no write method on %s", async (route) => {
    /* Read-only by construction, asserted rather than assumed. */
    const app = appAs("did:privy:me", ["did:privy:me"]);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await app.request(route, { method })).status).not.toBe(200);
    }
  });

  it("answers an admin", async () => {
    const app = appAs("did:privy:me", ["did:privy:me"]);

    const res = await app.request("/v1/admin/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(NOTHING);
  });

  it("does not run the query for a caller who is refused", async () => {
    /* The gate is above the handler, not inside it. A refused caller that
       still cost a scan of every account's snapshots would be a denial of
       service with a 404 on the end of it. */
    let ran = 0;
    const app = appAs("did:privy:nobody", ["did:privy:me"], {
      health: async () => {
        ran += 1;
        return NOTHING;
      },
    });

    await app.request("/v1/admin/health");

    expect(ran).toBe(0);
  });
});

describe("ranged", () => {
  /* A probe route, because the range-taking routes arrive with the queries.
     `ranged` is exported for this: the behaviour under test is the 400, and it
     is the same whichever query sits behind it. */
  const probe = (run: (r: { days: number }) => Promise<unknown> = async (r) => ({ days: r.days })) => {
    const app = new Hono();
    app.get("/probe", ranged(run));
    return app;
  };

  it("answers a mistyped date 400, not 500", async () => {
    /* Parsed in the handler and not thrown across the framework: Hono's
       compose turns a handler's throw into a response in the frame that called
       it, so a middleware awaiting next() never sees it, and app.ts's onError
       would log every mistyped date as `request failed` at error level. */
    const res = await probe().request("/probe?from=2026-02-30");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "bad_range", message: "2026-02-30 is not a date." },
    });
  });

  it("answers 400 for a range beyond the cap, naming it", async () => {
    const res = await probe().request("/probe?from=2020-01-01&to=2026-01-01");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/366 days/);
  });

  it("passes a good range through", async () => {
    const res = await probe().request("/probe?from=2026-09-01&to=2026-09-08");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: 7 });
  });

  it("defaults the range when none is given", async () => {
    const res = await probe().request("/probe");

    expect(await res.json()).toEqual({ days: 30 });
  });

  it("does not turn a real failure into a 400", async () => {
    /* Only BadRange is the caller's mistake. A broken query must not be
       reported as a mistyped date. */
    const res = await probe(async () => {
      throw new Error("relation does not exist");
    }).request("/probe");

    expect(res.status).toBe(500);
  });
});
