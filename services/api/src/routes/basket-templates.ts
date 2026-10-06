import { Hono } from "hono";
import { ManagedBasketInsights, ManagedBasketTemplate } from "@mercury/types";
import type { BasketService } from "../baskets/core/service.js";

/** Public catalog reads never enroll a wallet or move funds. */
export function basketTemplateRoutes(service: BasketService): Hono {
  const app = new Hono();

  app.get("/v1/basket-templates", async (c) =>
    c.json({ templates: ManagedBasketTemplate.array().parse(await service.listTemplates()) }),
  );

  app.get("/v1/basket-templates/:slug", async (c) => {
    const template = await service.getTemplate(c.req.param("slug"));
    if (template === null)
      return c.json({ error: { code: "not_found", message: "Unknown basket template." } }, 404);
    return c.json({ template: ManagedBasketTemplate.parse(template) });
  });

  app.get("/v1/basket-templates/:slug/insights", async (c) => {
    const insights = await service.getInsights(c.req.param("slug"));
    if (insights === null)
      return c.json({ error: { code: "not_found", message: "Unknown basket template." } }, 404);
    return c.json({ insights: ManagedBasketInsights.parse(insights) });
  });

  return app;
}
