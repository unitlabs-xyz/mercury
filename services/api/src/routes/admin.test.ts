import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { adminRoutes, type AdminDeps } from "./admin.js";
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
