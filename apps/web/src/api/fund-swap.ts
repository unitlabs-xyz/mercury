import { useSignAndSendTransaction, type ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { solBalanceRaw, tokenBalanceRaw } from "../solana/rpc";
import { refreshAfterChain } from "./settle";

/** Relay's identifier for native SOL, which is a lamport balance and not a token account. */
export const NATIVE_SOL = "11111111111111111111111111111111";

/**
 * What the connected wallet holds of the token somebody picked.
 *
 * Read straight from the chain, like `useFunderUsdc` — our API has no opinion
 * on a wallet that is not an account we keep. `undefined` is a balance nobody
 * could read and it is not zero; the panel has to tell those apart, which is
 * the lesson `FundFromWallet` records about showing "Balance: 0" against a
 * wallet holding 5.69.
 */
export const useFunderBalance = (owner: string | undefined, mint: string | undefined) =>
  useQuery({
    queryKey: ["funder-token", owner, mint],
    enabled: owner !== undefined && mint !== undefined,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: () => (mint === NATIVE_SOL ? solBalanceRaw(owner!) : tokenBalanceRaw(owner!, mint!)),
  });

interface SwapBuild {
  readonly intentId: string;
  readonly transaction: string;
  readonly in: { readonly amountFormatted: string; readonly symbol: string };
  readonly out: { readonly amountFormatted: string; readonly symbol: string };
  readonly impactPct: string | null;
}

export interface SwapReceipt {
  readonly signature: string;
  readonly outFormatted: string;
}

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

/**
 * Swap a token the connected wallet holds into USDC in the account.
 *
 * Four steps and the order matters. The server quotes and composes, because
 * `recipient` decides whose account the money lands in and a page that built
 * its own transaction could name any wallet it liked. The wallet signs *and*
 * broadcasts, so there is no window in which we hold a signed transaction
 * nobody has sent. Then we confirm, which is the only step that writes the
 * deposit down as landed.
 *
 * A confirm that answers `transaction_pending` is not a failure — the node may
 * not have caught up — so it is retried a few times before giving up, and
 * giving up still leaves a signature the user can look up.
 */
export const useFundSwapAction = (wallet: ConnectedStandardSolanaWallet | undefined) => {
  const qc = useQueryClient();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const action = useMutation<SwapReceipt, Error, { chainId: number; currency: string; amountRaw: string }>({
    mutationFn: async (input) => {
      if (wallet === undefined) throw new Error("Connect a wallet to pay from first.");

      const built = await apiFetch<SwapBuild>("/v1/money/fund/swap", {
        method: "POST",
        body: JSON.stringify({ ...input, from: wallet.address }),
      });

      const { signature } = await signAndSendTransaction({
        transaction: toBytes(built.transaction),
        wallet,
        chain: "solana:mainnet",
      });
      /* Base58 is what an explorer wants and what the server reads. */
      const base58 = getBase58Decoder().decode(signature);
      const receipt = { signature: base58, outFormatted: built.out.amountFormatted };

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await apiFetch("/v1/money/fund/confirm", {
            method: "POST",
            body: JSON.stringify({ intentId: built.intentId, signature: base58 }),
          });
          return receipt;
        } catch (error: unknown) {
          /* Anything but "not settled yet" is a real failure and says so. */
          if (!(error instanceof Error && /pending/i.test(error.message))) throw error;
          if (attempt < 4) await new Promise((r) => setTimeout(r, 1500));
        }
      }

      /*
       * Still unconfirmed after five tries. The swap is on chain either way —
       * the wallet broadcast it — so this succeeds with the signature rather
       * than reporting a failure that did not happen. The deposit reconciler
       * in the wallet-events pass names it when the USDC shows up.
       */
      return receipt;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["funder-token"] });
      void qc.invalidateQueries({ queryKey: ["fund-intents"] });
      refreshAfterChain(qc);
    },
  });

  return { ...action, walletReady: wallet !== undefined };
};
