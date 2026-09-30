import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Decision } from "@mercury/types";
import { ApiError, apiFetch } from "./client";

/**
 * Where an order has got to.
 *
 * Reported, not displayed. These were labels on the button once, and the button
 * now shows one spinner for the whole of it — see `OrderSheet`. They stay
 * because they are how `placeOrder` says which of its five calls it is on,
 * which is what `orders.test.ts` asserts the order of, and what a failure
 * report would want to name.
 */
export type OrderStep = "pricing" | "building" | "signing" | "sending" | "recording" | "done";

export interface OrderIntent {
  readonly ticker: string;
  readonly side: "buy" | "sell";
  /** Dollars on both sides. Ignored by the server when `max` is set. */
  readonly usd: number;
  /** Sell the whole position, in tokens. Never set on a buy. */
  readonly max?: boolean;
}

export interface OrderResult {
  readonly orderId: string;
  readonly shares: string;
  readonly pricePerShare: string;
  readonly usd: string;
  /** What the sale made, against average cost. Null on a buy. */
  readonly realisedPnlUsd: string | null;
}

/**
 * The price moved between the quote shown and the transaction being built, far
 * enough that the server stopped rather than fill it. Carries the decision it
 * would fill at now, so the sheet can put the new number in front of the user
 * and let them decide again.
 */
export class PriceMoved extends Error {
  constructor(
    message: string,
    readonly decision: Decision | null,
  ) {
    super(message);
    this.name = "PriceMoved";
  }
}

const movedFrom = (e: ApiError): PriceMoved => {
  const details = e.details;
  const decision =
    details !== null && typeof details === "object" && "decision" in details
      ? ((details as { decision: Decision }).decision ?? null)
      : null;
  return new PriceMoved(e.message, decision);
};

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * Everything `placeOrder` needs from the outside world.
 *
 * Injected rather than imported so the order of the calls — which is the whole
 * of what `placeOrder` decides — can be tested without a browser, a wallet or a
 * server. React supplies these in `useOrderAction`.
 */
export interface OrderIo {
  post<T>(path: string, body: unknown): Promise<T>;
  /** Takes an unsigned transaction in base64 and gives back a signed one. */
  sign(unsigned: string): Promise<string>;
  onStep(step: OrderStep): void;
}

/**
 * One order, end to end, whichever way it points.
 *
 * Five calls, in this order, because each depends on the last: the server
 * prices the order and records it, re-decides and builds an unsigned
 * transaction, the wallet signs it, the server broadcasts it and waits for
 * confirmation, and the signature goes back so the fill is read off the chain
 * and written into the books.
 *
 * The decision shown on the page and the one that governs the order are both
 * the server's now, but they are made at different moments — once when the
 * order is created and again before it is built. That is why this can refuse
 * an order the page thought was fine, and why the refusal is worth showing
 * rather than swallowing.
 *
 * Nothing here is side-specific but the side itself. The five calls, their
 * order and their failure modes are the same selling as buying.
 */
export async function placeOrder(io: OrderIo, intent: OrderIntent): Promise<OrderResult> {
  io.onStep("pricing");
  const created = await io.post<{ orderId: string; decision: Decision }>("/v1/orders", {
    ticker: intent.ticker,
    side: intent.side,
    amount: String(intent.usd),
    /* Omitted rather than false, so a buy's body is what it always was. */
    ...(intent.max === true ? { max: true } : {}),
  });
  if (created.decision.kind === "refuse") throw new Error(created.decision.detail);

  io.onStep("building");
  const built = await io
    .post<{ transactions: string[] }>(`/v1/orders/${created.orderId}/execute`, {})
    .catch((e: unknown) => {
      // A price that ran away is not a failure to report as one — it is a
      // question, and the answer is the user's.
      if (e instanceof ApiError && e.code === "price_moved") throw movedFrom(e);
      throw e;
    });

  const unsigned = built.transactions[0];
  if (unsigned === undefined) throw new Error("The server built no transaction to sign.");

  io.onStep("signing");
  const signed = await io.sign(unsigned);

  io.onStep("sending");
  const sent = await io.post<{ signature: string; status: string; error?: string | null }>(
    "/v1/transactions/send",
    { transaction: signed },
  );
  if (sent.status === "failed") throw new Error(sent.error ?? "The transaction failed on chain.");

  io.onStep("recording");
  const filled = await io.post<{
    shares: string;
    pricePerShare: string;
    usd: string;
    realisedPnlUsd?: string | null;
  }>(`/v1/orders/${created.orderId}/confirm`, { signature: sent.signature });

  io.onStep("done");
  return { orderId: created.orderId, ...filled, realisedPnlUsd: filled.realisedPnlUsd ?? null };
}

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
      void qc.invalidateQueries({ queryKey: ["api"] });
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
