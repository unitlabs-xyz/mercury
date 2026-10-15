/**
 * The admin surface.
 *
 * Every route is a GET, and this module is handed query functions rather than
 * a database handle. That is the difference between read-only as a property of
 * the code and read-only as a promise in a comment: a `Db` would carry
 * `insert`, `update` and `delete` into a module whose whole contract is that
 * it cannot write. It is also the convention `deps.ts` already documents —
 * every route module takes its queries as functions — and it is what lets the
 * authorisation tests run without a database at all.
 */
import { Hono, type Handler } from "hono";
import { requireAdmin } from "../admin/allowlist.js";
import { BadRange, parseRange, type Range } from "../admin/range.js";
import type { Freshness } from "../admin/freshness.js";

export interface AdminDeps {
  readonly admins: readonly string[];
  readonly health: () => Promise<Freshness>;
}

/**
 * A handler that needs a date range, answering 400 rather than 500 for one
 * that was mistyped.
 *
 * Parsed here, in the handler, rather than thrown across the framework — and
 * that is not a style preference either. Hono's `compose` catches a handler's
 * throw in the same `dispatch` frame that called it and turns it into a
 * response through `onError`; it never rethrows, so a `try`/`catch` around
 * `await next()` in a middleware can never see it. Measured. Routing it
 * through `onError` would also work, and would be worse: `app.ts`'s handler
 * logs every error it sees as `request failed` at error level, so every
 * mistyped date would land in the error stream somebody is watching for real
 * failures.
 *
 * The message names the cap, because the only person who will read it is an
 * engineer looking at their own dashboard.
 */
export const ranged =
  <T>(run: (range: Range) => Promise<T>): Handler =>
  async (c) => {
    let range: Range;
    try {
      range = parseRange(c.req.query());
    } catch (error: unknown) {
      if (!(error instanceof BadRange)) throw error;
      return c.json({ error: { code: "bad_range", message: error.message } }, 400);
    }
    return c.json(await run(range));
  };

export const adminRoutes = (deps: AdminDeps): Hono => {
  const app = new Hono();

  /*
   * Above the handlers, so a refused caller costs a set lookup and nothing
   * else. Inside them it would be a denial of service with a 404 on the end.
   */
  app.use("/v1/admin/*", requireAdmin(deps.admins));

  /* No range: it is three max() reads, bounded by definition. */
  app.get("/v1/admin/health", async (c) => c.json(await deps.health()));

  return app;
};
