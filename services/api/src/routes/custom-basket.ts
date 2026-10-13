import { Hono } from "hono";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { PickableAsset } from "../baskets/core/primitives.js";

export interface CustomBasketDeps {
  readonly assets: () => Promise<readonly PickableAsset[]>;
}

/**
 * Baskets somebody wrote for themselves.
 *
 * Separate from `/v1/basket-templates`, which is the curated catalogue and
 * stays public. Nothing here is listed anywhere a stranger can reach: a custom
 * basket is private to its author, and keeping the two sets of routes apart is
 * what makes that hard to get wrong by accident.
 */
export function customBasketRoutes(deps: CustomBasketDeps): Hono {
  const app = new Hono();

  /**
   * What a basket may hold.
   *
   * Behind auth, though it leaks nothing personal — it is the same list for
   * everybody. Only somebody building a basket has any use for it, and
   * `/v1/*` is authenticated as a whole.
   */
  app.get("/v1/custom-baskets/assets", async (c) => c.json({ assets: await deps.assets() }));

  return app;
}
