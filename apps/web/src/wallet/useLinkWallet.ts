import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppKitProvider } from "@reown/appkit/react";
import { apiFetch } from "../api/client";
import { signatureBase58, WALLETS_KEY, type AccountWallet } from "../api/wallets";

/*
 * AppKit, so this sits behind the lazy boundary in
 * `app/settings/LinkWalletSection.tsx` with everything else that touches it.
 * See `app/money/FundFromChainWithWallet.tsx` for why.
 */

/** What AppKit's Solana provider is asked for here: one message signed. */
interface MessageSigner {
  signMessage(message: Uint8Array): Promise<unknown>;
}

/**
 * Link the Solana wallet connected through AppKit.
 *
 * Three steps, one approval: the server issues the message (and refuses at
 * once if the link would be refused anyway), the wallet signs it in its own
 * pop-up, and the server checks the signature against what it issued.
 */
export const useLinkWallet = () => {
  const qc = useQueryClient();
  const { walletProvider } = useAppKitProvider<MessageSigner>("solana");
  return useMutation({
    mutationFn: async (address: string) => {
      if (walletProvider === undefined) throw new Error("Connect the wallet first.");
      const { challengeId, message } = await apiFetch<{ challengeId: string; message: string }>(
        "/v1/wallets/link/challenge",
        { method: "POST", body: JSON.stringify({ address }) },
      );
      const signed = await walletProvider.signMessage(new TextEncoder().encode(message));
      return apiFetch<{ wallet: AccountWallet; relinked: boolean }>("/v1/wallets/link", {
        method: "POST",
        body: JSON.stringify({ challengeId, signature: signatureBase58(signed) }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WALLETS_KEY }),
  });
};
