import { useSyncExternalStore } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import type {
  BasketExitAsset,
  BasketExitMode,
  BasketActivity,
  BasketInsights,
  BasketOperation,
  BasketPortfolio,
  BasketPortfolioSnapshot,
  BasketPortfolioSummary,
  Basket,
  PreparedBasketEnrollment,
  PreparedBasketExit,
  PreparedBasketFunding,
  SubmittedBasketExit,
  TriggeredBasketRebalance,
} from "@mercury/types";
import { enrollBasket, fundBasket, solanaAccountId, type FundingReceipt } from "@mercury/view";
import { ApiError, apiFetch, toBase64, toBytes, useSignedIn } from "../api";

/**
 * Glider baskets, read and acted on through our API, as the web's
 * `api/baskets.ts` does. A template is a strategy; enrolling creates the
 * person's own Glider smart account for it, funding sends USDC there, and an
 * exit brings the assets home. Every write is prepared by the server, checked
 * here (see `fundBasket` in `@mercury/view`), and signed by the embedded wallet.
 */

const basketPath = (slug: string) => `/v1/baskets/${encodeURIComponent(slug)}`;

/** The wallet a basket belongs to. Owner-scoped reads wait for it, as the web's do. */
const useWalletAddress = () => useEmbeddedSolanaWallet().wallets?.[0]?.address;

/** Signed in, with the wallet loaded: the condition every owner-scoped read waits on. */
const useOwner = () => {
  const signedIn = useSignedIn();
  const address = useWalletAddress();
  return { ready: signedIn && address !== undefined, address };
};

/** The curated shelf and the caller's own baskets, in one list, each marked `source`. */
export const useBaskets = () =>
  useQuery({
    queryKey: ["api", "baskets"],
    queryFn: async () => (await apiFetch<{ baskets: Basket[] }>("/v1/baskets")).baskets,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

export const useBasket = (slug: string) =>
  useQuery({
    queryKey: ["api", "baskets", slug],
    queryFn: async () => (await apiFetch<{ basket: Basket }>(basketPath(slug))).basket,
    enabled: slug.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });

export const useBasketInsights = (slug: string) =>
  useQuery({
    queryKey: ["api", "baskets", slug, "insights"],
    queryFn: async () =>
      (await apiFetch<{ insights: BasketInsights }>(`${basketPath(slug)}/insights`)).insights,
    enabled: slug.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });

/** Every basket this wallet has enrolled in, with what each holds now. */
export const useOwnedBasketPortfolios = () => {
  const owner = useOwner();
  return useQuery({
    queryKey: ["api", "basket-portfolios", owner.address],
    queryFn: async () =>
      (await apiFetch<{ portfolios: BasketPortfolioSummary[] }>("/v1/basket-portfolios")).portfolios,
    enabled: owner.ready,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
};

/** This wallet's portfolio for one strategy, or null when it has not enrolled. */
export const useBasketEnrollment = (slug: string) => {
  const owner = useOwner();
  return useQuery({
    queryKey: ["api", "basket-enrollment", slug, owner.address],
    queryFn: async () =>
      (await apiFetch<{ portfolio: BasketPortfolio | null }>(`${basketPath(slug)}/portfolio`)).portfolio,
    enabled: owner.ready && slug.length > 0,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
};

/** The live smart account: its value, its assets, its rebalance schedule. */
export const useBasketPortfolio = (slug: string, enrolled: boolean) => {
  const owner = useOwner();
  return useQuery({
    queryKey: ["api", "basket-portfolio", slug, owner.address],
    queryFn: async () =>
      (
        await apiFetch<{ portfolio: BasketPortfolioSnapshot | null }>(
          `${basketPath(slug)}/portfolio/positions`,
        )
      ).portfolio,
    enabled: enrolled && owner.ready,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
};

export const useBasketActivity = (slug: string, enrolled: boolean) => {
  const owner = useOwner();
  return useQuery({
    queryKey: ["api", "basket-activity", slug, owner.address],
    queryFn: async () =>
      (await apiFetch<{ activity: BasketActivity[] }>(`${basketPath(slug)}/activity`)).activity,
    enabled: enrolled && owner.ready,
    retry: false,
    refetchInterval: 30_000,
  });
};

/** A rebalance or exit in flight, polled every few seconds until it settles. */
export const useBasketOperation = (slug: string, operationId: string | null) => {
  const owner = useOwner();
  return useQuery({
    queryKey: ["api", "basket-operation", slug, owner.address, operationId],
    queryFn: async () =>
      (
        await apiFetch<{ operation: BasketOperation }>(
          `${basketPath(slug)}/operations/${encodeURIComponent(operationId ?? "")}`,
        )
      ).operation,
    enabled: owner.ready && operationId !== null,
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && ["completed", "failed", "cancelled"].includes(state) ? false : 4_000;
    },
  });
};

/* ── operations in flight ─────────────────────────────────────────────────── */

/*
 * The operation a portfolio is waiting on, kept where both the detail screen
 * and its sheets can reach it. The web keeps these in sessionStorage; here
 * they live for the session in memory, which is what that amounts to.
 */
export interface TrackedOperation {
  readonly slug: string;
  readonly name: string;
  readonly operationId: string;
  readonly kind: "rebalance" | "exit";
  readonly mode?: BasketExitMode;
}
let tracked: Readonly<Record<string, TrackedOperation>> = {};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const trackOperation = (portfolioId: string, op: TrackedOperation) => {
  tracked = { ...tracked, [portfolioId]: op };
  listeners.forEach((l) => l());
};
/** On sign-out: the next account has no business seeing this one's operations. */
export const forgetTrackedOperations = () => {
  tracked = {};
  listeners.forEach((l) => l());
};
export const useTrackedOperation = (portfolioId: string | undefined) =>
  useSyncExternalStore(subscribe, () => (portfolioId === undefined ? undefined : tracked[portfolioId]));
/** Every operation started this session, by portfolio: what the Baskets landing lists. */
export const useTrackedOperations = () => useSyncExternalStore(subscribe, () => tracked);

/** Several operations at once, each polled until it settles. */
export const useBasketOperations = (requests: readonly { slug: string; operationId: string }[]) => {
  const owner = useOwner();
  return useQueries({
    queries: requests.map(({ slug, operationId }) => ({
      queryKey: ["api", "basket-operation", slug, owner.address, operationId],
      queryFn: async () =>
        (
          await apiFetch<{ operation: BasketOperation }>(
            `${basketPath(slug)}/operations/${encodeURIComponent(operationId)}`,
          )
        ).operation,
      enabled: owner.ready,
      retry: false,
      refetchInterval: (query: { state: { data?: BasketOperation } }) => {
        const state = query.state.data?.state;
        return state && ["completed", "failed", "cancelled"].includes(state) ? false : 4_000;
      },
    })),
  });
};

/* ── signing ──────────────────────────────────────────────────────────────── */

/**
 * The embedded wallet's two signatures, in the encodings our API expects. A
 * transaction goes in and comes out as base64; a message goes to Privy as
 * base64 and its signature comes back base64, which the API takes as base58 —
 * the web gets there from raw bytes, which is the same thing.
 */
const useSigner = () => {
  const wallet = useEmbeddedSolanaWallet();
  const account = wallet.wallets?.[0];
  const provider = async () => {
    if (account === undefined) throw new Error("Your Solana wallet is still loading.");
    return account.getProvider();
  };
  return {
    ready: account !== undefined,
    address: account?.address,
    signTransaction: async (base64: string) => {
      const { signedTransaction } = await (
        await provider()
      ).request({
        method: "signTransaction",
        params: { transaction: VersionedTransaction.deserialize(toBytes(base64)) },
      });
      return toBase64(signedTransaction.serialize());
    },
    signMessage: async (text: string) => {
      const { signature } = await (
        await provider()
      ).request({
        method: "signMessage",
        params: { message: Buffer.from(text, "utf8").toString("base64") },
      });
      return bs58.encode(Buffer.from(signature, "base64"));
    },
  };
};

/* ── writes ───────────────────────────────────────────────────────────────── */

export const useBasketEnrollmentAction = (slug: string) => {
  const qc = useQueryClient();
  const signer = useSigner();
  const mutation = useMutation({
    mutationFn: () =>
      enrollBasket(slug, {
        prepare: () =>
          apiFetch<PreparedBasketEnrollment>(`${basketPath(slug)}/enrollment/prepare`, { method: "POST" }),
        submit: async (body) =>
          (
            await apiFetch<{ portfolio: BasketPortfolio }>(`${basketPath(slug)}/enrollment/submit`, {
              method: "POST",
              body: JSON.stringify(body),
            })
          ).portfolio,
        signMessage: signer.signMessage,
        signTransaction: signer.signTransaction,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["api", "basket-enrollment", slug] });
      void qc.invalidateQueries({ queryKey: ["api", "basket-portfolios"] });
    },
  });
  return { ...mutation, walletReady: signer.ready };
};

const confirmFunding = (slug: string, signature: string) =>
  apiFetch(`${basketPath(slug)}/funding/confirm`, { method: "POST", body: JSON.stringify({ signature }) });

/**
 * USDC from the wallet to the portfolio: prepared by the server, re-checked by
 * `fundBasket`, signed here, relayed, then confirmed. Confirmation waits on
 * the RPC's indexing, so it is retried for a few seconds and otherwise left
 * pending — the transfer happened, and saying so is not the same as saying it
 * failed. The wallet pays its own SOL network fee; Glider funding is not
 * sponsored.
 */
export const useBasketFundingAction = (slug: string) => {
  const qc = useQueryClient();
  const signer = useSigner();
  const mutation = useMutation({
    mutationFn: async ({
      amountUsd,
      portfolio,
    }: {
      amountUsd: string;
      portfolio: BasketPortfolio;
    }): Promise<FundingReceipt> => {
      const receipt = await fundBasket(amountUsd, portfolio, {
        prepare: (amount) =>
          apiFetch<PreparedBasketFunding>(`${basketPath(slug)}/funding/prepare`, {
            method: "POST",
            body: JSON.stringify({ amountUsd: amount }),
          }),
        sign: signer.signTransaction,
        send: (wire) =>
          apiFetch<FundingReceipt>("/v1/transactions/send", {
            method: "POST",
            body: JSON.stringify({ transaction: wire }),
          }),
      });
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          await confirmFunding(slug, receipt.signature);
          return { ...receipt, status: "confirmed" };
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== "transaction_pending") throw error;
          if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
      return { ...receipt, status: "pending" };
    },
    onSettled: () => {
      for (const key of [
        "basket-enrollment",
        "basket-portfolio",
        "basket-activity",
        "basket-portfolios",
        "money",
      ])
        void qc.invalidateQueries({ queryKey: ["api", key] });
    },
  });
  return { ...mutation, walletReady: signer.ready };
};

export const useBasketRebalanceAction = (slug: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<TriggeredBasketRebalance>(`${basketPath(slug)}/rebalance`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["api", "basket-activity", slug] }),
  });
};

/** Prepared first, so the sheet shows the exact assets and recipient before the wallet signs. */
export const useBasketExitAction = (slug: string) => {
  const qc = useQueryClient();
  const signer = useSigner();
  /* Without assets, the whole portfolio; with them, exactly those amounts. */
  const prepare = useMutation({
    mutationFn: ({ mode, assets }: { mode: BasketExitMode; assets?: BasketExitAsset[] }) =>
      apiFetch<PreparedBasketExit>(`${basketPath(slug)}/exit/${mode}/prepare`, {
        method: "POST",
        ...(assets ? { body: JSON.stringify({ assets }) } : {}),
      }),
  });
  const submit = useMutation({
    mutationFn: async (prepared: PreparedBasketExit) => {
      if (signer.address === undefined) throw new Error("Your Solana wallet is unavailable.");
      if (
        prepared.recipientAccountId !== solanaAccountId(signer.address) ||
        prepared.message.recipientAccountId !== prepared.recipientAccountId ||
        prepared.message.portfolioId !== prepared.portfolioId
      )
        throw new Error("Withdrawal destination changed. Review the exit again.");
      if (Date.parse(prepared.expiresAt) <= Date.now() + 5_000)
        throw new Error("Withdrawal review expired. Prepare it again.");
      const signature = await signer.signMessage(prepared.authorization.text);
      return apiFetch<SubmittedBasketExit>(`${basketPath(slug)}/exit/${prepared.mode}/submit`, {
        method: "POST",
        body: JSON.stringify({ message: prepared.message, signature, submission: prepared.submission }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["api", "basket-activity", slug] }),
  });
  return { prepare, submit, walletReady: signer.ready };
};
