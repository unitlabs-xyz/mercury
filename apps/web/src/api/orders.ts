import { useEffect } from "react";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { placeOrder, type OrderIntent, type OrderResult } from "@mercury/view";
import { ApiError, apiFetch } from "./client";
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

/*
 * A sent order whose confirm has not landed yet. The transaction is on chain;
 * only our record of it is missing, so the signature is kept until the node
 * catches up and the fill can be read off it. Session-scoped, like the basket
 * funding receipt it mirrors.
 */
const PENDING_KEY = "order-confirm";

type SentOrder = { orderId: string; signature: string };

const readSent = (): SentOrder | null => {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orderId?: unknown; signature?: unknown };
    return typeof parsed.orderId === "string" && typeof parsed.signature === "string"
      ? { orderId: parsed.orderId, signature: parsed.signature }
      : null;
  } catch {
    return null;
  }
};

const confirmSent = (sent: SentOrder) =>
  apiFetch(`/v1/orders/${encodeURIComponent(sent.orderId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ signature: sent.signature }),
  });

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
          onSent: (sent) => sessionStorage.setItem(PENDING_KEY, JSON.stringify(sent)),
          settled: () => sessionStorage.removeItem(PENDING_KEY),
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

  /*
   * An order whose confirm ran out of attempts, or whose tab was reloaded
   * mid-confirm. The transaction is already on chain, so this keeps asking
   * until the node can answer — or until the server says the claim is bad.
   */
  useEffect(() => {
    if (mutation.isPending) return undefined;
    let stopped = false;
    const attempt = async () => {
      const sent = readSent();
      if (sent === null || stopped) return;
      try {
        await confirmSent(sent);
        sessionStorage.removeItem(PENDING_KEY);
        refreshAfterChain(qc);
      } catch (error) {
        /* Only a node that is behind is worth asking again; a rejected claim never changes. */
        if (error instanceof ApiError && error.code !== "transaction_pending") {
          sessionStorage.removeItem(PENDING_KEY);
        }
      }
    };
    void attempt();
    const timer = setInterval(() => void attempt(), 5_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [mutation.isPending, qc]);

  return { ...mutation, walletReady, reset: () => mutation.reset() };
};
