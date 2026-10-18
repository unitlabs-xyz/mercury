import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useEmbeddedWallet } from "../auth/embedded";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useSignedIn } from "./hooks";
import { refreshAfterChain } from "./settle";
import { forgetConfirm, rememberConfirm, usePendingConfirms } from "./pending-confirm";

const KIND = "earn";

/** One vault as the wire carries it: every figure a decimal string. */
type VaultWire = {
  address: string;
  name: string;
  picked: boolean;
  curator: string | null;
  kind: "crypto" | "real-world" | "mixed" | null;
  logo: string | null;
  blurb: string | null;
  apy: string;
  apy7d: string | null;
  apy30d: string | null;
  apy365d: string | null;
  tvlUsd: string;
  holders: number;
  performanceFee: string;
  managementFee: string;
  minDepositUsd: string;
  full: boolean;
};

type HoldingWire = VaultWire & { balanceUsd: string; earnedUsd: string };

type EarnWire = {
  selected: string;
  holdings: HoldingWire[];
  balanceUsd: string;
  earnedUsd: string;
  apy: string | null;
  walletUsd: string;
};

export type EarnVault = {
  address: string;
  name: string;
  /** One of Mercury's picks: those carry a curator, a kind and our own line about them. */
  picked: boolean;
  curator: string | null;
  /** What the money is lent against. Known for Mercury's picks only. */
  kind: "crypto" | "real-world" | "mixed" | null;
  /** A mark the app ships under /earn, or null for a monogram. */
  logo: string | null;
  blurb: string | null;
  /** Right now, after fees, 0–1. */
  apy: number;
  apy7d: number | null;
  apy30d: number | null;
  apy365d: number | null;
  tvlUsd: number;
  holders: number;
  performanceFee: number;
  managementFee: number;
  minDepositUsd: number;
  /** At its deposit cap: takes nothing more. */
  full: boolean;
};

export type EarnHolding = EarnVault & { balanceUsd: number; earnedUsd: number };

export type Earn = {
  /** Where new cash goes unless another vault is picked: the last one moved into. */
  selected: string;
  /** Every vault this account has money in. Empty is not earning yet. */
  holdings: EarnHolding[];
  balanceUsd: number;
  earnedUsd: number;
  /** What the whole balance earns now; null with nothing in. */
  apy: number | null;
  /** Idle in the wallet: what could move in. */
  walletUsd: number;
};

const n = (v: string | null) => (v === null ? null : Number(v));

const vaultFromWire = (w: VaultWire): EarnVault => ({
  address: w.address,
  name: w.name,
  picked: w.picked,
  curator: w.curator,
  kind: w.kind,
  logo: w.logo,
  blurb: w.blurb,
  apy: Number(w.apy),
  apy7d: n(w.apy7d),
  apy30d: n(w.apy30d),
  apy365d: n(w.apy365d),
  tvlUsd: Number(w.tvlUsd),
  holders: w.holders,
  performanceFee: Number(w.performanceFee),
  managementFee: Number(w.managementFee),
  minDepositUsd: Number(w.minDepositUsd),
  full: w.full,
});

export const EARN_KEY = ["api", "earn"] as const;

/** What this account has in Earn, vault by vault, and its idle cash. */
export const useEarn = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: EARN_KEY,
    queryFn: async (): Promise<Earn> => {
      const w = await apiFetch<EarnWire>("/v1/earn");
      return {
        selected: w.selected,
        holdings: w.holdings.map((h) => ({
          ...vaultFromWire(h),
          balanceUsd: Number(h.balanceUsd),
          earnedUsd: Number(h.earnedUsd),
        })),
        balanceUsd: Number(w.balanceUsd),
        earnedUsd: Number(w.earnedUsd),
        apy: n(w.apy),
        walletUsd: Number(w.walletUsd),
      };
    },
    enabled: signedIn,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
};

/** Every vault on offer, Mercury's picks first. Rates move slowly; five minutes is fresh. */
export const useEarnVaults = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "earn", "vaults"],
    queryFn: async () =>
      (await apiFetch<{ vaults: VaultWire[] }>("/v1/earn/vaults")).vaults.map(vaultFromWire),
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
};

export type VaultRange = "1M" | "3M" | "1Y";

export type VaultHistory = {
  points: { at: string; apy: number; tvlUsd: number }[];
  /** Where the money is lent right now, largest first; shares add up to 1. */
  allocation: { market: string; name: string; share: number }[];
};

/** One vault's rate over time and where it lends. `lite` is the rate alone, for a card. */
export const useEarnVault = (address: string | null, range: VaultRange, lite = false) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "earn", "vault", address, range, lite],
    queryFn: async (): Promise<VaultHistory> => {
      const w = await apiFetch<{
        points: { at: string; apy: string; tvlUsd: string }[];
        allocation: { market: string; name: string; share: string }[];
      }>(`/v1/earn/vaults/${address}?range=${range}${lite ? "&lite=1" : ""}`);
      return {
        points: w.points.map((p) => ({ at: p.at, apy: Number(p.apy), tvlUsd: Number(p.tvlUsd) })),
        allocation: w.allocation.map((a) => ({ ...a, share: Number(a.share) })),
      };
    },
    enabled: signedIn && address !== null,
    staleTime: 10 * 60_000,
    // The last range's chart while another range loads, for the same vault only:
    // another vault's chart standing in for this one's is wrong, not just stale.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === address ? keepPreviousData(previous) : undefined,
  });
};

/** A move into or out of one vault. "all" deposits every dollar in the wallet, or withdraws every share. */
export type EarnIntent =
  | { kind: "deposit"; usd: string | "all"; vault: string }
  | { kind: "withdraw"; usd: string | "all"; vault: string };

type SentEarn = { signature: string; action: EarnIntent };

const confirmSent = (sent: SentEarn) =>
  apiFetch("/v1/earn/confirm", { method: "POST", body: JSON.stringify(sent) });

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * Moves into or out of Earn, end to end, one after another: the server builds
 * each with the relayer paying, the embedded wallet signs, the server sends
 * and waits for it to land, and the confirm tells the server how much moved so
 * "earned" has a basis. Moving to another vault is two of these: everything
 * out of the old one, then everything in the wallet into the new one.
 */
export const useEarnAction = () => {
  const qc = useQueryClient();
  const { wallet } = useEmbeddedWallet();
  const { signTransaction } = useSignTransaction();

  const mutation = useMutation({
    mutationFn: async ({ intents }: { intents: EarnIntent[] }) => {
      const signatures: string[] = [];
      for (const intent of intents) {
        if (wallet === undefined) throw new Error("No wallet is connected to sign with.");
        const built = await apiFetch<{ transactions: string[]; vault: string }>("/v1/earn/transactions", {
          method: "POST",
          body: JSON.stringify(intent),
        });
        let last: string | undefined;
        for (const tx of built.transactions) {
          const { signedTransaction } = await signTransaction({ transaction: toBytes(tx), wallet });
          const sent = await apiFetch<{ signature: string; status: string; error?: string | null }>(
            "/v1/transactions/send",
            { method: "POST", body: JSON.stringify({ transaction: toBase64(signedTransaction) }) },
          );
          if (sent.status === "failed") throw new Error(sent.error ?? "The transaction failed on chain.");
          last = sent.signature;
          signatures.push(sent.signature);
        }
        /* As a loan's confirm: the money has moved, so a failed confirm is retried later, never thrown. */
        if (last !== undefined) {
          const sent = { signature: last, action: { ...intent, vault: built.vault } };
          rememberConfirm(KIND, sent);
          await confirmSent(sent)
            .then(() => forgetConfirm(KIND, sent.signature))
            .catch(() => undefined);
        }
      }
      return { signatures };
    },
    onSettled: () => refreshAfterChain(qc),
  });

  usePendingConfirms<SentEarn>(KIND, confirmSent, {
    paused: mutation.isPending,
    onSettled: () => refreshAfterChain(qc),
  });

  return { ...mutation, walletReady: wallet !== undefined };
};

/**
 * A failed move, in words. Our API's refusals carry their own sentence; the
 * wallet's can be a bare object with a `message`, which `instanceof Error`
 * misses and which used to surface as "Something went wrong." with the reason
 * thrown away. Logged whole, for whoever opens the console.
 */
export const earnErrorText = (err: unknown): string => {
  console.error("earn: the move failed", err);
  if (err instanceof Error && err.message) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.length > 0) return message;
  return "The move did not go through. Your money has not moved.";
};
