/**
 * The admin surface.
 *
 * Every route is a GET, and this module is handed query functions rather than
 * a database handle. That is the difference between read-only as a property of
 * the code and read-only as a promise in a comment: a `Db` would carry
 * `insert`, `update` and `delete` into a module whose whole contract is that
 * it cannot write. It is also the convention `deps.ts` already documents —
 * every route module takes its queries as functions — and it is what lets the
 * authorisation tests below run without a database at all.
 */
import { Hono } from "hono";
import { requireAdmin } from "../admin/allowlist.js";
import type { Freshness } from "../admin/freshness.js";

export interface AdminDeps {
  readonly admins: readonly string[];
  readonly health: () => Promise<Freshness>;
}

export const adminRoutes = (deps: AdminDeps): Hono => {
  const app = new Hono();

  /*
   * Above the handlers, so a refused caller costs a set lookup and nothing
   * else. Inside them it would be a denial of service with a 404 on the end.
   */
  app.use("/v1/admin/*", requireAdmin(deps.admins));

  app.get("/v1/admin/health", async (c) => c.json(await deps.health()));

  return app;
};
