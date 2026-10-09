import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { VersionedTransaction } from "@solana/web3.js";
import { sendUsdc, type SendIntent, type SendReceipt } from "@mercury/view";
import { apiFetch } from "./client.js";
import { toBase64, toBytes } from "./orders.js";
import { refreshAfterChain } from "./settle.js";

export { SendSubmissionUncertain, type SendIntent, type SendReceipt } from "@mercury/view";

/**
 * Sending USDC, as the web's `useSendAction`: the server builds the transfer,
 * the embedded wallet signs it, the relay broadcasts it. The sequence and its
 * one rule — an unclear outcome is "check before sending again", never a plain
 * failure — are `sendUsdc` in `@mercury/view`.
 */
export const useSendAction = () => {
  const qc = useQueryClient();
  const wallet = useEmbeddedSolanaWallet();
  const account = wallet.wallets?.[0];

  const action = useMutation<SendReceipt, Error, SendIntent>({
    mutationFn: async (intent) => {
      if (account === undefined) throw new Error("Your wallet is not ready to sign yet.");
      const provider = await account.getProvider();
      return sendUsdc(
        {
          prepare: async (request) =>
            (
              await apiFetch<{ transaction: string }>("/v1/money/send/prepare", {
                method: "POST",
                body: JSON.stringify(request),
              })
            ).transaction,
          sign: async (transaction) => {
            const { signedTransaction } = await provider.request({
              method: "signTransaction",
              params: { transaction: VersionedTransaction.deserialize(toBytes(transaction)) },
            });
            return toBase64(signedTransaction.serialize());
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

  return { ...action, walletReady: account !== undefined };
};
