import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base64EncodedWireTransaction,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import { USDC_MINT } from "@mercury/chain";
import { BasketFundingPreflightError, type BasketFunding } from "../core/deps.js";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  TOKEN_PROGRAM,
  associatedTokenAddress,
  transferInstruction,
} from "../../relay/usdc.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:";
const USDC = USDC_MINT as Address;

const nativeAddress = (accountId: string): Address => {
  if (!accountId.startsWith(SOLANA)) throw new Error("Funding account is not on Solana mainnet");
  return address(accountId.slice(SOLANA.length));
};

export async function buildFundingTransaction(input: {
  owner: Address;
  destination: Address;
  amountRaw: bigint;
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}): Promise<string> {
  const sourceAta = await associatedTokenAddress(input.owner, USDC);
  const destinationAta = await associatedTokenAddress(input.destination, USDC);
  const createDestinationAta: Instruction = {
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    accounts: [
      { address: input.owner, role: 3 },
      { address: destinationAta, role: 1 },
      { address: input.destination, role: 0 },
      { address: USDC, role: 0 },
      { address: SYSTEM_PROGRAM, role: 0 },
      { address: TOKEN_PROGRAM, role: 0 },
    ],
    data: new Uint8Array([1]), // CreateIdempotent
  };
  const transfer = transferInstruction({
    source: sourceAta,
    destination: destinationAta,
    owner: input.owner,
    amount: input.amountRaw,
  });
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.owner, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: input.blockhash,
          lastValidBlockHeight: input.lastValidBlockHeight,
        },
        m,
      ),
    (m) => appendTransactionMessageInstructions([createDestinationAta, transfer], m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

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
    const transaction = await buildFundingTransaction({ owner, destination, amountRaw, ...lifetime });
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
