import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { VersionedTransaction } from "@solana/web3.js";
import { borrowFromWire, type BorrowIntent, type BorrowWire } from "@mercury/view";
import { apiFetch } from "./client.js";
import { useSignedIn } from "./hooks.js";
import { toBase64, toBytes } from "./orders.js";
import { refreshAfterChain } from "./settle.js";

export type { Borrow, BorrowIntent, BorrowRow, Health } from "@mercury/view";

/**
 * Where a loan stands, read from Kamino through our API, in the shape the web
 * reads it. A minute between reads: the figure only moves when a price does or
 * a loan is touched, and touching a loan already refreshes it.
 */
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

/**
 * One borrowing action, end to end, as the web's `useBorrowAction` runs it: the
 * server checks it against the safety target and builds unsigned transactions,
 * the embedded wallet signs each, and the server broadcasts them in order,
 * waiting for each to confirm. A first-time borrower signs twice: one-time
 * setup, then the action. The network fee is the server's, so a wallet with
 * no SOL can still borrow.
 */
export const useBorrowAction = () => {
  const qc = useQueryClient();
  const wallet = useEmbeddedSolanaWallet();

  const mutation = useMutation({
    mutationFn: async (intent: BorrowIntent) => {
      const account = wallet.wallets?.[0];
      if (account === undefined) throw new Error("No wallet is ready to sign with.");
      const provider = await account.getProvider();

      const built = await apiFetch<{ transactions: string[]; firstTime: boolean }>(
        "/v1/borrow/transactions",
        { method: "POST", body: JSON.stringify(intent) },
      );

      const signatures: string[] = [];
      for (const unsigned of built.transactions) {
        const { signedTransaction } = await provider.request({
          method: "signTransaction",
          params: { transaction: VersionedTransaction.deserialize(toBytes(unsigned)) },
        });
        const sent = await apiFetch<{ signature: string; status: string; error?: string | null }>(
          "/v1/transactions/send",
          { method: "POST", body: JSON.stringify({ transaction: toBase64(signedTransaction.serialize()) }) },
        );
        if (sent.status === "failed") throw new Error(sent.error ?? "The transaction failed on chain.");
        signatures.push(sent.signature);
      }

      /*
       * Tell the server what just happened. Kamino pays into this wallet, so
       * every job watching balances sees a loan as cash arriving; only the
       * client knows it asked to borrow. The last signature is the action's
       * own. Swallowed, as on the web: the money has already moved, and a
       * failed confirm costs a row in the feed, not the borrow.
       */
      const signature = signatures.at(-1);
      if (signature !== undefined) {
        await apiFetch("/v1/borrow/confirm", {
          method: "POST",
          body: JSON.stringify({ signature, action: intent }),
        }).catch(() => undefined);
      }

      return { signatures };
    },
    onSettled: () => {
      refreshAfterChain(qc);
    },
  });

  /* Privy fills the wallet list a beat after launch; an empty list then is
     not a missing wallet. */
  const walletReady = (wallet.wallets?.length ?? 0) > 0;

  return { ...mutation, walletReady };
};
