import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./client";
import { refreshAfterChain } from "./settle";

export interface SendIntent {
  readonly amount: string;
  readonly to: string;
}

export interface SendReceipt {
  readonly signature: string;
  readonly status: "confirmed" | "pending";
}

export class SendSubmissionUncertain extends Error {
  constructor() {
    super("Submission could not be confirmed. Check your wallet activity before trying another transfer.");
  }
}

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export interface SendIo {
  prepare: (intent: SendIntent) => Promise<string>;
  sign: (transaction: string) => Promise<string>;
  submit: (signedTransaction: string) => Promise<SendReceipt>;
}

export async function sendUsdc(io: SendIo, intent: SendIntent): Promise<SendReceipt> {
  const transaction = await io.prepare(intent);
  const signed = await io.sign(transaction);
  try {
    const receipt = await io.submit(signed);
    if (receipt.status === "confirmed" || receipt.status === "pending") return receipt;
    throw new Error("The transfer failed on chain.");
  } catch (error) {
    // A 4xx is a definite rejection. A lost response or server error could
    // happen after broadcast, so never invite a new transfer automatically.
    if (error instanceof ApiError && error.status < 500) throw error;
    throw new SendSubmissionUncertain();
  }
}

export const useSendAction = () => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const action = useMutation<SendReceipt, Error, SendIntent>({
    mutationFn: async (intent) => {
      const wallet = wallets[0];
      if (wallet === undefined) throw new Error("Your wallet is not ready to sign yet.");
      return sendUsdc(
        {
          prepare: async (request) => {
            const built = await apiFetch<{ transaction: string }>("/v1/money/send/prepare", {
              method: "POST",
              body: JSON.stringify(request),
            });
            return built.transaction;
          },
          sign: async (transaction) => {
            const signed = await signTransaction({ transaction: toBytes(transaction), wallet });
            return toBase64(signed.signedTransaction);
          },
          submit: (transaction) =>
            apiFetch<SendReceipt>("/v1/transactions/send", {
              method: "POST",
              body: JSON.stringify({ transaction }),
            }),
        },
        intent,
      );
    },
    onSuccess: () => refreshAfterChain(qc),
  });

  return { ...action, walletReady: wallets[0] !== undefined };
};
