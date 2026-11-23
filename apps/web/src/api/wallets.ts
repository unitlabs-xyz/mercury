import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBase58Decoder } from "@solana/kit";
import { ApiError, apiFetch } from "./client";
import { useSignedIn } from "./hooks";

/**
 * The wallets on someone's account: the Mercury wallet, and the Solana wallets
 * they already hold and have linked beside it.
 *
 * Linking proves control with one signed message. It never adds the wallet to
 * Privy, and nothing here can move a linked wallet's funds: every action from
 * one is signed in its own pop-up.
 */
export interface AccountWallet {
  readonly id: string;
  readonly address: string;
  readonly kind: "privy_embedded" | "external";
  readonly isPrimary: boolean;
  readonly label: string | null;
  readonly linkedAt: string | null;
}

export interface AccountWallets {
  readonly wallets: readonly AccountWallet[];
  /** How many may be linked at once, beside the Mercury wallet. */
  readonly limit: number;
}

/** The query every wallet read and write shares. */
export const WALLETS_KEY = ["api", "wallets"] as const;
const KEY = WALLETS_KEY;

/** The first and last four characters, which is how a wallet shows an address. */
export const shortAddress = (address: string): string =>
  address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;

/** What a wallet is called on screen: "Mercury", its label, or its short address. */
export const walletName = (w: Pick<AccountWallet, "isPrimary" | "label" | "address">): string =>
  w.isPrimary ? "Mercury" : (w.label ?? shortAddress(w.address));

/** Linked wallets being followed. The Mercury wallet is not one. */
export const linkedCount = (wallets: readonly AccountWallet[]): number =>
  wallets.filter((w) => !w.isPrimary).length;

/** "3 of 5 linked". */
export const linkedLine = (account: AccountWallets): string =>
  `${linkedCount(account.wallets)} of ${account.limit} linked`;

/**
 * A wallet's signature as the server takes it: base58.
 *
 * Typed loosely because the wallets underneath disagree, as they do for
 * transactions (`signatureOf` in fund-swap.ts): AppKit's wallet-standard
 * provider answers the bytes, Phantom's injected API answers `{ signature }`,
 * and some answer base58 already.
 */
export const signatureBase58 = (result: unknown): string => {
  const value =
    result !== null && typeof result === "object" && "signature" in result
      ? (result as { signature: unknown }).signature
      : result;
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof Uint8Array && value.length === 64) return getBase58Decoder().decode(value);
  throw new Error("Your wallet did not return a signature.");
};

/**
 * What to tell somebody whose link did not go through, from what the server
 * or their wallet said. The server's own sentence where it has one.
 */
export const linkErrorCopy = (err: unknown): string => {
  if (err instanceof ApiError) return err.message;
  const message = err instanceof Error ? err.message : "";
  // Every wallet words a declined prompt differently; they all say "reject".
  if (/reject|denied|cancel/i.test(message)) return "You declined to sign, so nothing was linked.";
  return message.length > 0 ? message : "Linking didn't go through. Try again.";
};

export const useAccountWallets = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<AccountWallets>("/v1/wallets"),
    enabled: signedIn,
  });
};

export const useRenameWallet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string | null }) =>
      apiFetch(`/v1/wallets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ label }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

/**
 * Unlink, or unlink and delete everything Mercury kept about the wallet.
 * Everything per wallet is read again afterwards, since what is shown changes.
 */
export const useUnlinkWallet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteHistory }: { id: string; deleteHistory: boolean }) =>
      apiFetch(`/v1/wallets/${encodeURIComponent(id)}${deleteHistory ? "?history=delete" : ""}`, {
        method: "DELETE",
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["api"] }),
  });
};
