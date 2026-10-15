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

/** An app with the identity already set, as requireAuth would leave it. */
const appAs = (privyUserId: string, admins: readonly string[], deps: Partial<AdminDeps> = {}) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "u1", privyUserId, walletAddress: null });
    await next();
  });
  app.route("/", adminRoutes({ admins, health: async () => NOTHING, ...deps }));
  return app;
};

describe("admin routes", () => {
  it("answers 404 to an authenticated caller who is not an admin", async () => {
    /* 404 and not 403: a 403 confirms the surface exists. It reads every
       account's holdings, so there is no reason to advertise it. */
    const app = appAs("did:privy:nobody", ["did:privy:me"]);

    const res = await app.request("/v1/admin/health");

    expect(res.status).toBe(404);
  });

  it("answers an admin", async () => {
    const app = appAs("did:privy:me", ["did:privy:me"]);

    const res = await app.request("/v1/admin/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(NOTHING);
  });

  it("answers 404 to everybody when the allowlist is empty", async () => {
    /* The unmounted case, asserted at the route level as well: a config that
       was never set must not leave the surface open to the first caller. */
    const app = appAs("did:privy:me", []);

    expect((await app.request("/v1/admin/health")).status).toBe(404);
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

  it("exposes no route that is not a GET", async () => {
    /* Read-only by construction, asserted rather than assumed. The surface
       reads every account in the system; a POST on it is a bug nobody would
       notice until it mattered. */
    const app = appAs("did:privy:me", ["did:privy:me"]);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await app.request("/v1/admin/health", { method });
      expect(res.status).not.toBe(200);
    }
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
