import { SAMPLE_NO_LOGIN } from "../dev/sample";
import { queryOptions, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useEmbeddedWallet } from "../auth/embedded";
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
import { claimWallet, forgetConfirm, rememberConfirm, usePendingConfirms } from "./pending-confirm";
import { refreshAfterChain } from "./settle";
import { useTransactionSigner } from "./signer";

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
  const { address: walletAddress } = useEmbeddedWallet();
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
  const { address: walletAddress } = useEmbeddedWallet();
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
  const { address } = useEmbeddedWallet();
  return useQuery({
    queryKey: ["api", "basket-portfolio", slug, user?.id, address],
    queryFn: async () =>
      (
        await apiFetch<{ portfolio: ManagedBasketPortfolioSnapshot | null }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}/portfolio`,
        )
      ).portfolio,
    enabled:
      enrolled &&
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(address)),
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
  const { address } = useEmbeddedWallet();
  return {
    signedIn:
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(address)),
    userId: user?.id,
    address,
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
/**
 * Whether what the wallet is about to sign pays out to `address` and nowhere
 * else: the review shown, the message signed and the portfolio all agree.
 * Checked before every exit signature, so a wallet never signs a payout to an
 * address nobody chose.
 */
export const paysOutTo = (
  prepared: Pick<PreparedBasketExit, "recipientAccountId" | "portfolioId" | "message">,
  address: string,
): boolean =>
  prepared.recipientAccountId === `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${address}` &&
  prepared.message.recipientAccountId === prepared.recipientAccountId &&
  prepared.message.portfolioId === prepared.portfolioId;

export const useBasketExitAction = (
  slug: string,
  /** A move: pay out in kind to the person's Mercury wallet, at this address, instead of to the owner. */
  toMercury?: string,
) => {
  const qc = useQueryClient();
  // The basket's owner approves: the Mercury wallet in Mercury, a linked wallet in its own pop-up.
  const signer = useTransactionSigner();
  const path = `/v1/basket-templates/${encodeURIComponent(slug)}/exit`;
  const query = toMercury === undefined ? "" : "?to=mercury";
  const prepare = useMutation({
    mutationFn: ({ mode, assets }: { mode: BasketExitMode; assets?: BasketExitAsset[] }) =>
      apiFetch<PreparedBasketExit>(`${path}/${mode}/prepare${query}`, {
        method: "POST",
        ...(assets ? { body: JSON.stringify({ assets }) } : {}),
      }),
  });
  const submit = useMutation({
    mutationFn: async (prepared: PreparedBasketExit) => {
      if (signer.address === null) throw new Error("Your Solana wallet is unavailable.");
      // Paid out where it was asked to go, and nowhere else: the owner, or the Mercury wallet for a move.
      if (!paysOutTo(prepared, toMercury ?? signer.address))
        throw new Error("Withdrawal destination changed. Review the exit again.");
      if (Date.parse(prepared.expiresAt) <= Date.now() + 5_000)
        throw new Error("Withdrawal review expired. Prepare it again.");
      const signed = await signer.signMessage(new TextEncoder().encode(prepared.authorization.text));
      const signature = getBase58Decoder().decode(signed);
      return apiFetch<SubmittedBasketExit>(`${path}/${prepared.mode}`, {
        method: "POST",
        body: JSON.stringify({ message: prepared.message, signature, submission: prepared.submission }),
      });
    },
    onSettled: () => refreshAfterChain(qc),
  });
  return { prepare, submit, walletReady: signer.walletReady, approver: signer.approver };
};

export const useBasketActivity = (slug: string, enrolled: boolean) => {
  const { ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { address } = useEmbeddedWallet();
  return useQuery({
    queryKey: ["api", "basket-activity", slug, user?.id, address],
    queryFn: async () =>
      (
        await apiFetch<{ activity: ManagedBasketActivity[] }>(
          `/v1/basket-templates/${encodeURIComponent(slug)}/activity`,
        )
      ).activity,
    enabled:
      enrolled &&
      basketEnrollmentEnabled(ready, authenticated, identityToken !== null) &&
      (SAMPLE_NO_LOGIN || Boolean(address)),
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
};

/* The pre-signing checks are shared with the phone: @mercury/view's baskets.ts. */
export { enrollBasket, fundBasket } from "@mercury/view";

const toBytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
};

export const useBasketEnrollmentAction = (slug: string) => {
  const qc = useQueryClient();
  // The wallet chosen becomes the basket's owner, and approves: Glider takes any Solana wallet's key.
  const signer = useTransactionSigner();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!signer.walletReady) throw new Error("Your Solana wallet is still loading.");
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
        signMessage: async (text) =>
          getBase58Decoder().decode(await signer.signMessage(new TextEncoder().encode(text))),
        signTransaction: async (base64) => toBase64(await signer.sign(toBytes(base64))),
      });
    },
    onSettled: () => refreshAfterChain(qc),
  });
  return { ...mutation, walletReady: signer.walletReady, approver: signer.approver };
};

const FUNDING_KIND = "funding";

type SentFunding = { slug: string; signature: string; wallet?: string };

const confirmSentFunding = ({ slug, signature, wallet }: SentFunding) =>
  apiFetch(`/v1/basket-templates/${encodeURIComponent(slug)}/funding/confirm`, {
    method: "POST",
    headers: claimWallet({ signature, ...(wallet === undefined ? {} : { wallet }) }),
    body: JSON.stringify({ signature }),
  });

export const useBasketFundingAction = (slug: string) => {
  const qc = useQueryClient();
  const signer = useTransactionSigner();
  const [step, setStep] = useState<"preparing" | "signing" | "sending" | null>(null);
  const mutation = useMutation({
    mutationFn: async ({
      amountUsd,
      portfolio,
    }: {
      amountUsd: string;
      portfolio: ManagedBasketPortfolio;
    }) => {
      if (!signer.walletReady) throw new Error("Your Solana wallet is still loading.");
      setStep("preparing");
      const receipt = await fundBasket(amountUsd, portfolio, {
        prepare: (amount) =>
          apiFetch<PreparedBasketFunding>(
            `/v1/basket-templates/${encodeURIComponent(slug)}/funding/prepare`,
            { method: "POST", body: JSON.stringify({ amountUsd: amount }) },
          ),
        sign: async (wire) => {
          setStep("signing");
          return toBase64(await signer.sign(toBytes(wire)));
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
    walletReady: signer.walletReady,
    approver: signer.approver,
    reset: () => {
      mutation.reset();
      setStep(null);
    },
  };
};
