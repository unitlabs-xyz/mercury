import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { placeOrder, type OrderIntent, type OrderResult } from "@mercury/view";
import { apiFetch } from "./client";
import { refreshAfterChain } from "./settle";

/**
 * The order sequence itself lives in `@mercury/view`, because the phone runs
 * the same five calls in the same order and two implementations of the path
 * that moves money is the last place to want them. Re-exported here so this
 * app's call sites and its tests keep the import they had.
 */
export {
  placeOrder,
  PriceMoved,
  type OrderIntent,
  type OrderIo,
  type OrderResult,
  type OrderStep,
} from "@mercury/view";

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** `placeOrder` with this app's plumbing behind it, and a step to render. */
export const useOrderAction = () => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const mutation = useMutation<OrderResult, Error, OrderIntent>({
    mutationFn: async (intent) => {
      const wallet = wallets[0];
      if (wallet === undefined) throw new Error("No wallet is connected to sign with.");
      return await placeOrder(
        {
          post: (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
          sign: async (unsigned) => {
            const { signedTransaction } = await signTransaction({
              transaction: toBytes(unsigned),
              wallet,
            });
            return toBase64(signedTransaction);
          },
          /*
           * Nowhere to put it. The button shows one spinner for the whole
           * order, so holding each step in React state only re-rendered this
           * dialog five times on the way to the same picture. `placeOrder`
           * still reports them; nothing on screen is waiting to hear.
           */
          onStep: () => undefined,
        },
        intent,
      );
    },
    onSettled: () => {
      refreshAfterChain(qc);
      void qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  /*
   * Privy hydrates the wallet list about 350ms after load, so for that moment
   * `wallets` is empty on a perfectly healthy session. Pressing Buy inside it
   * used to throw "No wallet is connected to sign with." — which reads as
   * "connect a wallet", when the wallet is ours and is simply not ready yet.
   * The sheet waits for this instead.
   */
  const walletReady = wallets[0] !== undefined;

  return { ...mutation, walletReady, reset: () => mutation.reset() };
};
