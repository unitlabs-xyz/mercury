import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useSignedIn } from "./hooks";
import { refreshAfterChain } from "./settle";
import { forgetConfirm, rememberConfirm, usePendingConfirm } from "./pending-confirm";
import { borrowFromWire, type BorrowIntent, type BorrowWire } from "@mercury/view";

/* The position's shape and its reading off the wire are shared with the phone. */
export type { Borrow, BorrowIntent, BorrowRow, Health } from "@mercury/view";

const PENDING_KEY = "borrow-confirm";

type SentLoan = { signature: string; action: BorrowIntent };

const parseSentLoan = (raw: unknown): SentLoan | null => {
  const claim = raw as { signature?: unknown; action?: unknown };
  return typeof claim?.signature === "string" && typeof claim.action === "object" && claim.action !== null
    ? { signature: claim.signature, action: claim.action as BorrowIntent }
    : null;
};

const confirmSentLoan = (sent: SentLoan) =>
  apiFetch("/v1/borrow/confirm", { method: "POST", body: JSON.stringify(sent) });

/** The account's Kamino position and what it can spend: cash plus what it could borrow. */
export const useBorrow = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "borrow"],
    queryFn: async () => borrowFromWire(await apiFetch<BorrowWire>("/v1/borrow")),
    enabled: signedIn,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
};

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * One borrowing action, end to end: the server checks it against the safety
 * target and builds unsigned transactions, the embedded wallet signs each, and
 * the server broadcasts them in order, waiting for each to confirm. A first-time
 * borrower signs twice: one-time setup, then the action.
 */
export const useBorrowAction = () => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const mutation = useMutation({
    mutationFn: async (intent: BorrowIntent) => {
      const wallet = wallets[0];
      if (wallet === undefined) throw new Error("No wallet is connected to sign with.");
      const built = await apiFetch<{ transactions: string[]; firstTime: boolean }>(
        "/v1/borrow/transactions",
        {
          method: "POST",
          body: JSON.stringify(intent),
        },
      );
      const signatures: string[] = [];
      for (const tx of built.transactions) {
        const { signedTransaction } = await signTransaction({ transaction: toBytes(tx), wallet });
        const sent = await apiFetch<{
          signature: string;
          status: string;
          ok?: boolean;
          error?: string | null;
          logs?: string[];
        }>("/v1/transactions/send", {
          method: "POST",
          body: JSON.stringify({ transaction: toBase64(signedTransaction) }),
        }).catch((e: unknown) => {
          // A failed simulation answers 422 with the program's own reason in the body.
          throw e instanceof Error ? e : new Error("The transaction failed.");
        });
        if (sent.status === "failed") throw new Error(sent.error ?? "The transaction failed on chain.");
        signatures.push(sent.signature);
      }

      /*
       * Tell the server what just happened.
       *
       * Nothing else can. Kamino pays into this wallet, so every job watching
       * balances sees a loan as cash arriving; only the client knows it asked
       * to borrow $500 against SPYx rather than receive $500 from a friend.
       *
       * The last signature is the action's own — an earlier one is the one-time
       * obligation setup, which moved nothing and has nothing to record.
       *
       * Deliberately not awaited into the result, and deliberately swallowed:
       * the money has already moved. A confirm that fails costs a row in the
       * feed, and throwing here would tell somebody their borrow failed when it
       * did not.
       */
      const signature = signatures.at(-1);
      if (signature !== undefined) {
        /* Kept before the attempt, so a node that is behind only delays the row. */
        rememberConfirm(PENDING_KEY, { signature, action: intent });
        await confirmSentLoan({ signature, action: intent })
          .then(() => forgetConfirm(PENDING_KEY))
          .catch(() => undefined);
      }

      return { signatures };
    },
    onSettled: () => {
      refreshAfterChain(qc);
    },
  });

  /* Same race the buy sheet waits out: Privy fills the wallet list a beat
     after load, and an empty list there is not a missing wallet. */
  const walletReady = wallets[0] !== undefined;

  /* A loan whose confirm the node was too slow to answer. Nothing else records one. */
  usePendingConfirm(PENDING_KEY, parseSentLoan, confirmSentLoan, mutation.isPending);

  return { ...mutation, walletReady };
};
