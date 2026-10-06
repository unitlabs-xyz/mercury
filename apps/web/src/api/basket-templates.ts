import { useQuery } from "@tanstack/react-query";
import type { ManagedBasketTemplate } from "@mercury/types";
import { apiFetch } from "./client";

export const useBasketTemplates = () =>
  useQuery({
    queryKey: ["api", "basket-templates"],
    queryFn: async () =>
      (await apiFetch<{ templates: ManagedBasketTemplate[] }>("/v1/basket-templates")).templates,
    staleTime: 5 * 60_000,
  });

export const useBasketTemplate = (slug: string) =>
  useQuery({
    queryKey: ["api", "basket-templates", slug],
    queryFn: async () =>
      (
        await apiFetch<{ template: ManagedBasketTemplate }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}`,
        )
      ).template,
    enabled: slug.length > 0,
    retry: false,
    staleTime: 60_000,
  });
