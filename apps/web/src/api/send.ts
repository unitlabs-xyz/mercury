import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { sendUsdc, type SendIntent, type SendQuote, type SendReceipt } from "@mercury/view";
import { useTransactionSigner } from "./signer";
import { refreshAfterChain } from "./settle";

/* The sequence and its uncertainty rule are shared with the phone: @mercury/view's send.ts. */
export {
  maxSendable,
  NO_SEND_QUOTE,
  sendUsdc,
  SendSubmissionUncertain,
  type SendIntent,
  type SendIo,
  type SendQuote,
  type SendReceipt,
} from "@mercury/view";

/**
 * What sending to this address costs, asked as soon as the address is valid.
 *
 * Before the amount, because the answer is what "Max" means. It turns only on
 * the recipient — whether they already hold USDC — so it neither needs nor
 * reacts to the amount being typed beside it.
 */
export const useSendQuote = (to: string | null) =>
  useQuery<SendQuote>({
    queryKey: ["send-quote", to],
    enabled: to !== null,
    // The recipient either holds USDC or does not, and that does not change
    // while a transfer is being typed.
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<SendQuote>("/v1/money/send/quote", {
        method: "POST",
        body: JSON.stringify({ to }),
      }),
  });

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export const useSendAction = () => {
  const qc = useQueryClient();
  // The wallet chosen signs: the Mercury wallet through Privy, a linked one in its own pop-up.
  const signer = useTransactionSigner();

  const action = useMutation<SendReceipt, Error, SendIntent>({
    mutationFn: async (intent) => {
      if (!signer.walletReady) throw new Error("Your wallet is not ready to sign yet.");
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
            return toBase64(await signer.sign(toBytes(transaction)));
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
    // Settled, not success: `SendSubmissionUncertain` throws on a send that may
    // well have landed, which is the case most in need of a fresh balance.
    onSettled: () => refreshAfterChain(qc),
  });

  return { ...action, walletReady: signer.walletReady, approver: signer.approver };
};
