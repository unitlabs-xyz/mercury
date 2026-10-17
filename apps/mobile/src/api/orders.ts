import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import type { Decision } from "@mercury/types";
import { placeOrder, type OrderIntent, type OrderResult } from "@mercury/view";
import { apiFetch } from "./client.js";
import { useSignedIn } from "./hooks.js";
import { refreshAfterChain } from "./settle.js";

export {
  placeOrder,
  PriceMoved,
  type OrderIntent,
  type OrderIo,
  type OrderResult,
  type OrderStep,
} from "@mercury/view";

/**
 * Base64 without `atob`/`btoa`, which Hermes does not define.
 *
 * `Buffer` is imported rather than taken off the global the polyfill installs.
 * The global is what `@solana/web3.js` needs at runtime, from inside its own
 * modules; a type for it here would mean depending on @types/node in a React
 * Native app, which only ever resolved because a stale node_modules happened
 * to hoist one.
 */
export const toBytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, "base64"));
export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** What a buy would cost right now: the decision, and the charge beside it. */
export interface Quote {
  readonly decision: Decision;
  /**
   * `usdc` is the whole charge, network cost and Mercury's fee together. The
   * parts are optional because a server that predates them sent `usdc` alone,
   * and then it was the network cost and nothing else.
   */
  readonly fee: {
    readonly usdc: string;
    readonly lamports: number;
    readonly network?: string;
    readonly mercury?: string;
    readonly mercuryBps?: number;
    readonly discount?: { readonly pct: number; readonly until: string };
  };
  /** What actually reaches the swap, after the charge. Null on a sell. */
  readonly investable: string | null;
  /** What a sale lands in the wallet, net of the charge. Absent on a buy. */
  readonly proceeds?: string;
}

/**
 * Prices an order without placing one.
 *
 * Every keystroke in the sheet would otherwise be a round trip, so the caller
 * debounces the amount and this keys on the settled figure. Disabled at zero:
 * there is no such thing as a quote for nothing, and asking for one returns a
 * refusal that reads like a fault.
 */
export const useQuote = (ticker: string, usd: number, side: "buy" | "sell" = "buy", max = false) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "quote", ticker, side, usd, max],
    queryFn: () =>
      apiFetch<Quote>("/v1/quote", {
        method: "POST",
        /* `max` is omitted rather than false, as `placeOrder` sends it. */
        body: JSON.stringify({ ticker, side, amount: String(usd), ...(max ? { max: true } : {}) }),
      }),
    enabled: signedIn && ticker.length > 0 && (usd > 0 || max),
    /* A quote is a price, and a price is only true for a moment. */
    staleTime: 10_000,
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });
};

/**
 * `placeOrder` with this app's plumbing behind it.
 *
 * The signing is where the two clients genuinely differ. The web's
 * `useSignTransaction` takes raw bytes; the Expo provider takes a web3.js
 * `VersionedTransaction` and gives one back, so the bytes are parsed here and
 * re-serialised after. Everything either side of that is the shared sequence.
 */
export const useOrderAction = () => {
  const qc = useQueryClient();
  const wallet = useEmbeddedSolanaWallet();

  const mutation = useMutation<OrderResult, Error, OrderIntent>({
    mutationFn: async (intent) => {
      const account = wallet.wallets?.[0];
      if (account === undefined) throw new Error("No wallet is ready to sign with.");
      const provider = await account.getProvider();

      return await placeOrder(
        {
          post: (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
          sign: async (unsigned) => {
            const tx = VersionedTransaction.deserialize(toBytes(unsigned));
            const { signedTransaction } = await provider.request({
              method: "signTransaction",
              params: { transaction: tx },
            });
            return toBase64(signedTransaction.serialize());
          },
          /*
           * Nowhere to put it. The sheet shows one spinner for the whole
           * order, so holding each step in state would re-render it five times
           * on the way to the same picture. `placeOrder` still reports them;
           * nothing on screen is waiting to hear.
           */
          onStep: () => undefined,
        },
        intent,
      );
    },
    onSettled: () => {
      refreshAfterChain(qc);
    },
  });

  /*
   * Privy hydrates the wallet list a few hundred milliseconds after launch, so
   * for that moment there is no wallet on a perfectly healthy session. Pressing
   * Buy inside it would throw "No wallet is ready to sign with", which reads as
   * "connect a wallet" — when the wallet is ours and is simply not up yet. The
   * sheet waits for this instead.
   */
  const walletReady = (wallet.wallets?.length ?? 0) > 0;

  return { ...mutation, walletReady };
};
