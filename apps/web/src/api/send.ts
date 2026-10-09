import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { sendUsdc, type SendIntent, type SendReceipt } from "@mercury/view";
import { refreshAfterChain } from "./settle";

/* The sequence and its uncertainty rule are shared with the phone: @mercury/view's send.ts. */
export {
  sendUsdc,
  SendSubmissionUncertain,
  type SendIntent,
  type SendIo,
  type SendReceipt,
} from "@mercury/view";

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

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
