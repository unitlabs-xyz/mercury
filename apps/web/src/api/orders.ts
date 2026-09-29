import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Decision } from "@mercury/types";
import { ApiError, apiFetch } from "./client";

/**
 * Where an order has got to, in the order it gets there. Named for what is
 * happening rather than which endpoint is in flight, because these strings are
 * shown to someone watching a button.
 */
export type BuyStep = "pricing" | "building" | "signing" | "sending" | "recording" | "done";

export const STEP_LABEL: Record<BuyStep, string> = {
  pricing: "Checking the price…",
  building: "Preparing your order…",
  signing: "Waiting for your approval…",
  sending: "Sending to Solana…",
  recording: "Recording it…",
  done: "Done",
};

export interface BuyIntent {
  readonly ticker: string;
  readonly usd: number;
}

export interface BuyResult {
  readonly orderId: string;
  readonly shares: string;
  readonly pricePerShare: string;
  readonly usd: string;
  /** True when the server is in dry-run mode: nothing was sent, nothing recorded. */
  readonly simulated: boolean;
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
 * Everything `placeBuy` needs from the outside world.
 *
 * Injected rather than imported so the order of the calls — which is the whole
 * of what `placeBuy` decides — can be tested without a browser, a wallet or a
 * server. React supplies these in `useBuyAction`.
 */
export interface BuyIo {
  post<T>(path: string, body: unknown): Promise<T>;
  /** Takes an unsigned transaction in base64 and gives back a signed one. */
  sign(unsigned: string): Promise<string>;
  onStep(step: BuyStep): void;
}

/**
 * One buy, end to end.
 *
 * Five calls, in this order, because each depends on the last: the server
 * prices the order and records it, re-decides and builds an unsigned
 * transaction, the wallet signs it, the server broadcasts it and waits for
 * confirmation, and the signature goes back so the fill is read off the chain
 * and written into the books.
 *
 * The decision shown on the page is the browser's own, quoted straight from
 * Jupiter. The one that governs the order is the server's, made twice — once
 * when the order is created and again before it is built. That is why this can
 * refuse an order the page thought was fine, and why the refusal is worth
 * showing rather than swallowing.
 */
export async function placeBuy(io: BuyIo, intent: BuyIntent): Promise<BuyResult> {
  io.onStep("pricing");
  const created = await io.post<{ orderId: string; decision: Decision }>("/v1/orders", {
    ticker: intent.ticker,
    side: "buy",
    amount: String(intent.usd),
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

  // A dry run never reaches the chain, so there is no fill to read and nothing
  // to record. Saying so beats a confirm that comes back 404.
  if (sent.status === "simulated") {
    io.onStep("done");
    return {
      orderId: created.orderId,
      shares: "0",
      pricePerShare: "0",
      usd: String(intent.usd),
      simulated: true,
    };
  }

  io.onStep("recording");
  const filled = await io.post<{ shares: string; pricePerShare: string; usd: string }>(
    `/v1/orders/${created.orderId}/confirm`,
    { signature: sent.signature },
  );

  io.onStep("done");
  return { orderId: created.orderId, ...filled, simulated: false };
}

/** `placeBuy` with this app's plumbing behind it, and a step to render. */
export const useBuyAction = () => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [step, setStep] = useState<BuyStep | null>(null);

  const mutation = useMutation<BuyResult, Error, BuyIntent>({
    mutationFn: async (intent) => {
      const wallet = wallets[0];
      if (wallet === undefined) throw new Error("No wallet is connected to sign with.");
      return await placeBuy(
        {
          post: (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
          sign: async (unsigned) => {
            const { signedTransaction } = await signTransaction({
              transaction: toBytes(unsigned),
              wallet,
            });
            return toBase64(signedTransaction);
          },
          onStep: setStep,
        },
        intent,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["api"] });
      void qc.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: () => setStep(null),
  });

  return { ...mutation, step, reset: () => (mutation.reset(), setStep(null)) };
};
