import { useQuery } from "@tanstack/react-query";
import type { ManagedBasketInsights, ManagedBasketTemplate } from "@mercury/types";
import { useSignedIn } from "./hooks";
import { apiFetch } from "./client";

/**
 * A basket as the app reads it: GET /v1/baskets, plus what Symmetry knows
 * about the vault behind it. The vault fields are optional because our own
 * curated baskets have no vault until they are launched.
 */
export interface Basket {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** Charged on the way in. Symmetry has no yearly fee; see docs/10. */
  readonly depositFeeBps?: number;
  readonly withdrawFeeBps?: number;
  /** The API's single fee, for a basket that has no vault yet. */
  readonly feeBps: number;
  readonly minimumUsd: string;
  readonly capUsd: string | null;
  readonly venue: "symmetry";
  readonly constituents: readonly { readonly ticker: string; readonly weightBps: number }[];
  readonly vault?: {
    /** The vault account, and the basket token it mints. */
    readonly address: string;
    readonly mint: string;
    readonly symbol: string;
    readonly creator: string;
    /** Unix seconds. The basket token started at $1.00 then. */
    readonly createdAt: number;
    readonly startPrice: number;
  };
  /** What you hold of it, if anything. */
  readonly position?: { readonly tokens: number; readonly costUsd: number } | null;
}

export const useBaskets = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "baskets"],
    queryFn: async () => (await apiFetch<{ baskets: Basket[] }>("/v1/baskets")).baskets,
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
};

/** Where anyone can see, and withdraw from, the vault without us. */
export const symmetryUrl = (mint: string) => `https://beta.symmetry.fi/dashboard/view/${mint}`;

/** Glider templates are managed portfolios, not the pooled Symmetry baskets above. */
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

export const useBasketInsights = (slug: string) =>
  useQuery({
    queryKey: ["api", "basket-templates", slug, "insights"],
    queryFn: async () =>
      (
        await apiFetch<{ insights: ManagedBasketInsights }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}/insights`,
        )
      ).insights,
    enabled: slug.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });
