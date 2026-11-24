import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useEmbeddedWallet } from "../auth/embedded";
import { useActingWallet } from "./acting-wallet";
import { walletName } from "./wallets";

export interface TransactionSigner {
  /** Ready to sign now. The Mercury wallet waits for Privy to hydrate; a linked wallet is asked when signing. */
  readonly walletReady: boolean;
  /** The linked wallet's name when it is the one that approves, for "Continue in Phantom"; null for the Mercury wallet. */
  readonly approver: string | null;
  /** One transaction, signed by the wallet chosen. Signed only: the server co-signs and sends it. */
  sign(transaction: Uint8Array): Promise<Uint8Array>;
}

/**
 * Who signs, for every action: the Mercury wallet through Privy, as always,
 * or the linked wallet chosen, in its own pop-up.
 *
 * The linked path loads AppKit only when it is asked to sign, with a dynamic
 * import: nothing in the eager bundle may import AppKit. Every flow builds,
 * signs and confirms the same way whichever wallet acts; only this differs.
 */
export const useTransactionSigner = (): TransactionSigner => {
  const { acting } = useActingWallet();
  const { wallet } = useEmbeddedWallet();
  const { signTransaction } = useSignTransaction();

  if (acting.kind === "linked") {
    const linked = acting.wallet;
    const name = walletName(linked);
    return {
      walletReady: true,
      approver: name,
      sign: async (transaction) => {
        const { signWithLinked } = await import("../wallet/linkedSigner");
        return signWithLinked(linked.address, name, transaction);
      },
    };
  }
  return {
    walletReady: wallet !== undefined,
    approver: null,
    sign: async (transaction) => {
      if (wallet === undefined) throw new Error("No wallet is connected to sign with.");
      return (await signTransaction({ transaction, wallet })).signedTransaction;
    },
  };
};
