import { describe, expect, it } from "vitest";
import { ManagedBasketTemplate } from "@mercury/types";
import { BasketService } from "../baskets/core/service.js";
import { JsonBasketStore } from "../baskets/glider/store.js";
import { basketTemplateRoutes } from "./basket-templates.js";

const routes = basketTemplateRoutes(new BasketService({ store: new JsonBasketStore("postgres://unused") }));

describe("basket template routes", () => {
  it("lists candidate Solana templates without requiring a wallet", async () => {
    const response = await routes.request("/v1/basket-templates");
    const body = (await response.json()) as { templates: unknown };
    const templates = ManagedBasketTemplate.array().parse(body.templates);

    expect(response.status).toBe(200);
    expect(templates).toHaveLength(22);
    expect(templates[0]).toEqual(
      expect.objectContaining({ kind: "managed_portfolio", status: "candidate", canEnroll: true }),
    );
    expect(
      templates.every((template) => {
        const primary = template.tags.filter((tag) => tag.startsWith("theme:") || tag === "shelf:pros");
        return primary.length === 1 && new Set(template.tags).size === template.tags.length;
      }),
    ).toBe(true);
    expect(templates.filter((template) => template.tags.includes("shelf:pros"))).toHaveLength(4);
    expect(templates.filter((template) => template.tags.includes("shelf:featured"))).toHaveLength(6);
    expect(templates.find((template) => template.slug === "magnificent-seven")?.tags).toContain(
      "theme:technology",
    );
  });

  it("returns 404 for an unknown template", async () => {
    const response = await routes.request("/v1/basket-templates/unknown");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Unknown basket template." },
    });
  });

  it("returns the selected template without inventing portfolio returns", async () => {
    const response = await routes.request("/v1/basket-templates/magnificent-seven");
    const body = (await response.json()) as { template: unknown };
    const template = ManagedBasketTemplate.parse(body.template);

    expect(response.status).toBe(200);
    expect(template.strategyId).toBe("01M465MY1C2KBER654KJDCYYK9");
    expect(template.performance).toBeNull();
    expect(template.tags).toContain("theme:technology");
  });
});
