import { useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBase58Decoder, type Address } from "@solana/kit";
import { useFundingWallet } from "../auth/embedded";
import { buildFundTransfer } from "../app/money/fund-transfer";
import { latestBlockhash, usdcBalanceRaw } from "../solana/rpc";
import { refreshAfterChain } from "./settle";

/**
 * What the attached wallet holds in USDC, read straight from the chain.
 *
 * Our API has no opinion on it — it is not an account we keep — so this is the
 * one read in the app that goes around the server. It decides what Max means
 * and whether an amount is more than there is.
 *
 * Refetched on focus because the wallet is in another window, and somebody who
 * just topped it up will come back expecting this to know.
 */
export const useFunderUsdc = (address: string | undefined) =>
  useQuery({
    queryKey: ["funder-usdc", address],
    enabled: address !== undefined,
    queryFn: () => usdcBalanceRaw(address!),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

export interface FundReceipt {
  readonly signature: string;
}

/**
 * Sign a USDC transfer into the Mercury wallet with the attached wallet.
 *
 * No server leg at all, which is the whole shape of this feature: the
 * transaction is built in the browser, signed and broadcast by the wallet that
 * is paying, and picked up by `wallet-events` on the next pass like any other
 * inbound USDC. Nothing to prepare, nothing to confirm, nothing to reconcile.
 *
 * The blockhash is read here rather than alongside the balance, because it
 * starts expiring the moment it is read and the next thing to happen is a
 * wallet asking somebody to approve.
 */
export const useFundAction = (to: string | undefined) => {
  const qc = useQueryClient();
  const { wallet } = useFundingWallet();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const action = useMutation<FundReceipt, Error, { amountRaw: bigint }>({
    mutationFn: async ({ amountRaw }) => {
      if (wallet === undefined) throw new Error("Connect a wallet to fund from first.");
      if (to === undefined) throw new Error("Your Mercury address is still loading.");

      const lifetime = await latestBlockhash();
      const transaction = await buildFundTransfer({
        from: wallet.address as Address,
        to: to as Address,
        amountRaw,
        ...lifetime,
      });

      /*
       * The wallet broadcasts it, so there is no window in which we hold a
       * signed transaction nobody has sent. A rejection at the wallet's own
       * screen throws here and means exactly what it says: nothing was sent.
       */
      const { signature } = await signAndSendTransaction({
        transaction,
        wallet,
        chain: "solana:mainnet",
      });
      return { signature: getBase58Decoder().decode(signature) };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["funder-usdc"] });
      refreshAfterChain(qc);
    },
  });

  return { ...action, walletReady: wallet !== undefined };
};
