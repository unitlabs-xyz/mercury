import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import type { ManagedBasketInsights, ManagedBasketTemplate, ManagedBasketPortfolio, PreparedBasketEnrollment } from "@mercury/types";
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

const enrollmentPath = (slug: string) => `/v1/basket-templates/${encodeURIComponent(slug)}/enrollment`;

export const basketEnrollmentEnabled = (ready: boolean, authenticated: boolean, hasIdentityToken: boolean) =>
  ready && authenticated && hasIdentityToken;

export const useBasketEnrollment = (slug: string) => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  return useQuery({
    queryKey: ["api", "basket-enrollment", slug, user?.id, walletAddress],
    queryFn: async () => (await apiFetch<{ portfolio: ManagedBasketPortfolio | null }>(enrollmentPath(slug))).portfolio,
    enabled: basketEnrollmentEnabled(ready, authenticated, identityToken !== null) && Boolean(walletAddress) && slug.length > 0,
    retry: false,
    staleTime: 15_000,
  });
};

interface EnrollmentIo {
  prepare: () => Promise<PreparedBasketEnrollment>;
  submit: (body: { intentId: string; signed: string }) => Promise<ManagedBasketPortfolio>;
  signMessage: (text: string) => Promise<string>;
  signTransaction: (base64: string) => Promise<string>;
}

/** One challenge, one wallet signature, one submission; Glider never receives a browser-held API key. */
export async function enrollBasket(_slug: string, io: EnrollmentIo): Promise<ManagedBasketPortfolio> {
  const prepared = await io.prepare();
  const signed = prepared.authorization.kind === "solana-message"
    ? await io.signMessage(prepared.authorization.text)
    : await io.signTransaction(prepared.authorization.transaction);
  return io.submit({ intentId: prepared.intentId, signed });
}

const toBytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export const useBasketEnrollmentAction = (slug: string) => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();
  const mutation = useMutation({
    mutationFn: async () => {
      const wallet = wallets[0];
      if (!wallet) throw new Error("Your Solana wallet is still loading.");
      const path = enrollmentPath(slug);
      return enrollBasket(slug, {
        prepare: () => apiFetch<PreparedBasketEnrollment>(`${path}/prepare`, { method: "POST" }),
        submit: async (body) => (await apiFetch<{ portfolio: ManagedBasketPortfolio }>(path, {
          method: "POST", body: JSON.stringify(body),
        })).portfolio,
        signMessage: async (text) => {
          const result = await signMessage({ message: new TextEncoder().encode(text), wallet });
          return getBase58Decoder().decode(result.signature);
        },
        signTransaction: async (base64) => {
          const result = await signTransaction({ transaction: toBytes(base64), wallet });
          return toBase64(result.signedTransaction);
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api", "basket-enrollment", slug] }),
  });
  return { ...mutation, walletReady: wallets[0] !== undefined };
};
