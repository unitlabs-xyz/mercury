import { address, createSolanaRpc, type Address, type Base64EncodedWireTransaction } from "@solana/kit";
import { BasketFundingPreflightError, type BasketFunding } from "../core/deps.js";
import { buildUsdcTransferTransaction } from "../../relay/usdc-transfer.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:";

const nativeAddress = (accountId: string): Address => {
  if (!accountId.startsWith(SOLANA)) throw new Error("Funding account is not on Solana mainnet");
  return address(accountId.slice(SOLANA.length));
};

export { buildUsdcTransferTransaction as buildFundingTransaction } from "../../relay/usdc-transfer.js";

/** Glider supplies the destination; this adapter only composes and simulates the wallet-paid SPL transfer. */
export class SolanaBasketFunding implements BasketFunding {
  private readonly rpc;

  constructor(rpcUrl: string) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  async prepare(ownerAccountId: string, destinationAccountId: string, amountRaw: bigint) {
    const owner = nativeAddress(ownerAccountId);
    const destination = nativeAddress(destinationAccountId);
    if (owner === destination) throw new Error("Portfolio account cannot be the owner's wallet");
    const { value: lifetime } = await this.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const transaction = await buildUsdcTransferTransaction({ owner, destination, amountRaw, ...lifetime });
    const simulated = await this.rpc
      .simulateTransaction(transaction as Base64EncodedWireTransaction, {
        encoding: "base64",
        commitment: "confirmed",
        sigVerify: false,
      })
      .send();
    if (simulated.value.err !== null) throw new BasketFundingPreflightError();
    return { transaction, expiresAt: new Date(Date.now() + 45_000) };
  }
}
