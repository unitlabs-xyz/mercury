/**
 * Who may read the admin surface.
 *
 * An allowlist of Privy DIDs rather than a `role` column, because a column
 * would be a second thing to keep in step with who actually works here and a
 * row anybody with database access could grant themselves. An environment
 * variable is changed by whoever can already deploy.
 *
 * Unset means the routes are never mounted, which is the same shape every
 * other optional capability in this service has: `read.fund` being undefined
 * is why `/v1/money/fund/sources` 404s and the app hides the funding method.
 * Absent configuration means the feature does not exist, not that it is open.
 *
 * An admin is an ordinary authenticated session plus membership of this list.
 * There is no admin password and no second credential, so there is nothing
 * new to leak.
 */
import type { MiddlewareHandler } from "hono";

export const parseAdmins = (raw: string | undefined): readonly string[] =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/**
 * Mounted after `requireAuth`, so `identity` is already resolved.
 *
 * Answers 404 and not 403. A 403 tells an unauthorised caller that the route
 * exists, which is the one fact worth withholding — the surface reads every
 * account's holdings, and there is no reason to advertise it to somebody
 * probing. The same answer an unmounted route gives, deliberately.
 */
export const requireAdmin = (admins: readonly string[]): MiddlewareHandler => {
  const allowed = new Set(admins);
  return async (c, next) => {
    if (!allowed.has(c.get("identity").privyUserId)) {
      return c.json({ error: { code: "not_found", message: "No such route." } }, 404);
    }
    await next();
    return undefined;
  };
};
