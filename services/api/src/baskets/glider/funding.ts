import { address, createSolanaRpc, type Address, type Base64EncodedWireTransaction } from "@solana/kit";
import { D } from "@mercury/core";
import { BasketFundingPreflightError, type BasketFunding } from "../core/deps.js";
import { buildUsdcTransferTransaction } from "../../relay/usdc-transfer.js";
import { buildSponsoredTransfer } from "../../relay/transfer.js";
import type { SponsoredBuilds } from "../../relay/builds.js";
import type { RelaySigner } from "../../relay/signer.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:";

const nativeAddress = (accountId: string): Address => {
  if (!accountId.startsWith(SOLANA)) throw new Error("Funding account is not on Solana mainnet");
  return address(accountId.slice(SOLANA.length));
};

export { buildUsdcTransferTransaction as buildFundingTransaction } from "../../relay/usdc-transfer.js";

/**
 * Glider supplies the destination; this adapter composes and simulates the
 * transfer that funds it.
 *
 * Sponsored when a relayer is configured, for the same reason a send is: the
 * money being moved is USDC, and a wallet that holds only USDC cannot pay a
 * network fee.
 *
 * Nothing is charged back, unlike a send. A send may have to open the
 * recipient's USDC account, and that rent becomes an asset at an address the
 * sender chose — which is why they repay it. Here the destination is a Glider
 * deposit account this server resolved; the funder named nothing and chose
 * nothing, so its rent is ours. It is also at most once per portfolio.
 */
export class SolanaBasketFunding implements BasketFunding {
  private readonly rpc;

  constructor(
    rpcUrl: string,
    private readonly relay?: { readonly signer: RelaySigner; readonly builds: SponsoredBuilds },
  ) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  async prepare(ownerAccountId: string, destinationAccountId: string, amountRaw: bigint) {
    const owner = nativeAddress(ownerAccountId);
    const destination = nativeAddress(destinationAccountId);
    if (owner === destination) throw new Error("Portfolio account cannot be the owner's wallet");
    const relay = this.relay;

    const { value: lifetime } = await this.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();

    const built =
      relay === undefined
        ? {
            wire: await buildUsdcTransferTransaction({ owner, destination, amountRaw, ...lifetime }),
            messageBytes: null,
          }
        : await buildSponsoredTransfer({
            owner,
            destination,
            amountRaw,
            relayer: address(relay.signer.address),
            feeUsdc: D(0),
            ...lifetime,
          });

    const simulated = await this.rpc
      .simulateTransaction(built.wire as Base64EncodedWireTransaction, {
        encoding: "base64",
        commitment: "confirmed",
        sigVerify: false,
      })
      .send();
    if (simulated.value.err !== null) throw new BasketFundingPreflightError();
    /* Remembered only once it simulates, or the relayer will not co-sign it. */
    if (built.messageBytes !== null && relay !== undefined) relay.builds.remember(built.messageBytes);
    return { transaction: built.wire, expiresAt: new Date(Date.now() + 45_000) };
  }
}
