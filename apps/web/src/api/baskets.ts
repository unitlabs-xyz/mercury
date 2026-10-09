import { SAMPLE_NO_LOGIN } from "../dev/sample";
import { queryOptions, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import type {
  ManagedBasketInsights,
  ManagedBasketTemplate,
  ManagedBasketPortfolio,
  ManagedBasketPortfolioSnapshot,
  ManagedBasketPortfolioSummary,
  ManagedBasketOperation,
  TriggeredBasketRebalance,
  PreparedBasketEnrollment,
  ManagedBasketActivity,
  BasketExitMode,
  BasketExitAsset,
  PreparedBasketExit,
  SubmittedBasketExit,
} from "@mercury/types";
import type { PreparedBasketFunding } from "@mercury/types";
import { useSignedIn } from "./hooks";
import { enrollBasket, fundBasket, type FundingReceipt } from "@mercury/view";
import { apiFetch, ApiError } from "./client";
import { forgetConfirm, rememberConfirm, usePendingConfirms } from "./pending-confirm";
import { refreshAfterChain } from "./settle";

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

/** Glider MWR is read separately so the live portfolio value never waits for its curve. */
export const useBasketReturns = (enabled: boolean) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "basket-returns"],
    queryFn: async () =>
      (
        await apiFetch<{ returns: { portfolioId: string; percentChange: string | null }[] }>(
          "/v1/portfolio/basket-returns",
        )
      ).returns,
    enabled: signedIn && enabled,
    staleTime: 2 * 60_000,
    retry: false,
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
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

/** Live, owner-scoped Glider portfolios for the signed-in Solana wallet. */
export const useOwnedBasketPortfolios = () => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  return useQuery({
    queryKey: ["api", "basket-portfolios", user?.id, walletAddress],
    queryFn: async () =>
      (await apiFetch<{ portfolios: ManagedBasketPortfolioSummary[] }>("/v1/basket-portfolios")).portfolios,
    enabled:
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(walletAddress)),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
};

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
    // Glider's modeled-performance response is cached by our API for five minutes.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
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
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

const enrollmentPath = (slug: string) => `/v1/basket-templates/${encodeURIComponent(slug)}/enrollment`;

export const basketEnrollmentEnabled = (ready: boolean, authenticated: boolean, hasIdentityToken: boolean) =>
  SAMPLE_NO_LOGIN || (ready && authenticated && hasIdentityToken);

export const useBasketEnrollment = (slug: string) => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  return useQuery({
    queryKey: ["api", "basket-enrollment", slug, user?.id, walletAddress],
    queryFn: async () =>
      (await apiFetch<{ portfolio: ManagedBasketPortfolio | null }>(enrollmentPath(slug))).portfolio,
    enabled:
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(walletAddress)) &&
      slug.length > 0,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
};

export const useBasketPortfolio = (slug: string, enrolled: boolean) => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  return useQuery({
    queryKey: ["api", "basket-portfolio", slug, user?.id, wallets[0]?.address],
    queryFn: async () =>
      (
        await apiFetch<{ portfolio: ManagedBasketPortfolioSnapshot | null }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}/portfolio`,
        )
      ).portfolio,
    enabled:
      enrolled &&
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(wallets[0]?.address)),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
};

/** Who is asking, so one operation is cached per signed-in wallet rather than globally. */
type Viewer = { signedIn: boolean; userId: string | undefined; address: string | undefined };

const useViewer = (): Viewer => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  return {
    signedIn:
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(wallets[0]?.address)),
    userId: user?.id,
    address: wallets[0]?.address,
  };
};

/* Shared so one operation and a list of them are the same request, cache entry and cadence. */
const basketOperationQuery = (slug: string, operationId: string | null, enabled: boolean, viewer: Viewer) =>
  queryOptions({
    queryKey: ["api", "basket-operation", slug, viewer.userId, viewer.address, operationId],
    queryFn: async () =>
      (
        await apiFetch<{ operation: ManagedBasketOperation }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}/operations/${encodeURIComponent(operationId!)}`,
        )
      ).operation,
    enabled: enabled && Boolean(operationId) && viewer.signedIn,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && ["completed", "failed", "cancelled"].includes(state) ? false : 4_000;
    },
  });

export const useBasketOperation = (slug: string, operationId: string | null, enrolled: boolean) =>
  useQuery(basketOperationQuery(slug, operationId, enrolled, useViewer()));

/*
 * Several operations at once, for views that list baskets rather than one. The
 * count varies with the person's portfolios, so this cannot be a loop of
 * useBasketOperation; useQueries also keeps every state in one place to sort by.
 */
export const useBasketOperations = (requests: readonly { slug: string; operationId: string }[]) => {
  const viewer = useViewer();
  return useQueries({
    queries: requests.map((request) => basketOperationQuery(request.slug, request.operationId, true, viewer)),
  });
};

export const useBasketRebalanceAction = (slug: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TriggeredBasketRebalance>(`/v1/basket-templates/${encodeURIComponent(slug)}/rebalance`, {
        method: "POST",
      }),
    onSettled: () => refreshAfterChain(qc),
  });
};

/** Prepare first so the review sheet shows the exact assets and recipient before signing. */
export const useBasketExitAction = (slug: string) => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const path = `/v1/basket-templates/${encodeURIComponent(slug)}/exit`;
  const prepare = useMutation({
    mutationFn: ({ mode, assets }: { mode: BasketExitMode; assets?: BasketExitAsset[] }) =>
      apiFetch<PreparedBasketExit>(`${path}/${mode}/prepare`, {
        method: "POST",
        ...(assets ? { body: JSON.stringify({ assets }) } : {}),
      }),
  });
  const submit = useMutation({
    mutationFn: async (prepared: PreparedBasketExit) => {
      const wallet = wallets[0];
      if (!wallet) throw new Error("Your Solana wallet is unavailable.");
      if (
        prepared.recipientAccountId !== `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${wallet.address}` ||
        prepared.message.recipientAccountId !== prepared.recipientAccountId ||
        prepared.message.portfolioId !== prepared.portfolioId
      )
        throw new Error("Withdrawal destination changed. Review the exit again.");
      if (Date.parse(prepared.expiresAt) <= Date.now() + 5_000)
        throw new Error("Withdrawal review expired. Prepare it again.");
      const signed = await signMessage({
        message: new TextEncoder().encode(prepared.authorization.text),
        wallet,
      });
      const signature = getBase58Decoder().decode(signed.signature);
      return apiFetch<SubmittedBasketExit>(`${path}/${prepared.mode}`, {
        method: "POST",
        body: JSON.stringify({ message: prepared.message, signature, submission: prepared.submission }),
      });
    },
    onSettled: () => refreshAfterChain(qc),
  });
  return { prepare, submit, walletReady: wallets[0] !== undefined };
};

export const useBasketActivity = (slug: string, enrolled: boolean) => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();
  return useQuery({
    queryKey: ["api", "basket-activity", slug, user?.id, wallets[0]?.address],
    queryFn: async () =>
      (
        await apiFetch<{ activity: ManagedBasketActivity[] }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}/activity`,
        )
      ).activity,
    enabled:
      enrolled &&
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(wallets[0]?.address)),
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
};

/* The pre-signing checks are shared with the phone: @mercury/view's baskets.ts. */
export { enrollBasket, fundBasket } from "@mercury/view";

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
        submit: async (body) =>
          (
            await apiFetch<{ portfolio: ManagedBasketPortfolio }>(path, {
              method: "POST",
              body: JSON.stringify(body),
            })
          ).portfolio,
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
    onSettled: () => refreshAfterChain(qc),
  });
  return { ...mutation, walletReady: wallets[0] !== undefined };
};

const FUNDING_KIND = "funding";

type SentFunding = { slug: string; signature: string };

const confirmSentFunding = ({ slug, signature }: SentFunding) =>
  apiFetch(`/v1/basket-templates/${encodeURIComponent(slug)}/funding/confirm`, {
    method: "POST",
    body: JSON.stringify({ signature }),
  });

export const useBasketFundingAction = (slug: string) => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [step, setStep] = useState<"preparing" | "signing" | "sending" | null>(null);
  const mutation = useMutation({
    mutationFn: async ({
      amountUsd,
      portfolio,
    }: {
      amountUsd: string;
      portfolio: ManagedBasketPortfolio;
    }) => {
      const wallet = wallets[0];
      if (!wallet) throw new Error("Your Solana wallet is still loading.");
      setStep("preparing");
      const receipt = await fundBasket(amountUsd, portfolio, {
        prepare: (amount) =>
          apiFetch<PreparedBasketFunding>(
            `/v1/basket-templates/${encodeURIComponent(slug)}/funding/prepare`,
            { method: "POST", body: JSON.stringify({ amountUsd: amount }) },
          ),
        sign: async (wire) => {
          setStep("signing");
          const result = await signTransaction({ transaction: toBytes(wire), wallet });
          return toBase64(result.signedTransaction);
        },
        send: async (wire) => {
          setStep("sending");
          return apiFetch<FundingReceipt>("/v1/transactions/send", {
            method: "POST",
            body: JSON.stringify({ transaction: wire }),
          });
        },
      });
      const claim = { slug, signature: receipt.signature };
      rememberConfirm(FUNDING_KIND, claim);
      /*
       * One attempt, as a trade and a loan each make. Waiting out the node here
       * held the mutation open for twelve seconds and paused the sweep that
       * would have done the waiting anyway.
       */
      try {
        await confirmSentFunding(claim);
        forgetConfirm(FUNDING_KIND, receipt.signature);
        return { ...receipt, status: "confirmed" as const };
      } catch (error) {
        const pending = error instanceof ApiError && error.code === "transaction_pending";
        if (!pending) {
          /* An answer that will not change: stop asking, and say so. */
          forgetConfirm(FUNDING_KIND, receipt.signature);
          throw error;
        }
        return { ...receipt, status: "pending" as const };
      }
    },
    onSettled: () => refreshAfterChain(qc),
  });
  /* One claim per transfer, keyed by its signature: funding twice no longer loses the first. */
  const outstanding = usePendingConfirms<SentFunding>(FUNDING_KIND, confirmSentFunding, {
    paused: mutation.isPending,
    onSettled: () => refreshAfterChain(qc),
  });
  /*
   * Still unrecorded for this basket, so the sheet keeps saying so — and stops
   * saying it the moment the sweep records it, which a second copy of this in
   * component state did not.
   */
  const stillPending = outstanding.find((claim) => claim.slug === slug);
  const receipt: FundingReceipt | null = stillPending
    ? { signature: stillPending.signature, status: "pending" }
    : null;
  return {
    ...mutation,
    data: mutation.data ?? receipt,
    step,
    walletReady: wallets[0] !== undefined,
    reset: () => {
      mutation.reset();
      setStep(null);
    },
  };
};
