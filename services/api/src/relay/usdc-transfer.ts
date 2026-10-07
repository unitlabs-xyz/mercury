import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { USDC_MINT } from "@mercury/chain";

const USDC = USDC_MINT as Address;

/** A wallet-paid USDC transfer; the recipient's token account is opened if needed. */
export async function buildUsdcTransferTransaction(input: {
  owner: Address;
  destination: Address;
  amountRaw: bigint;
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}): Promise<string> {
  const [sourceAta] = await findAssociatedTokenPda({
    owner: input.owner,
    mint: USDC,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destinationAta] = await findAssociatedTokenPda({
    owner: input.destination,
    mint: USDC,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  // The transaction is built here and signed by the user's wallet in the browser.
  const signer = createNoopSigner(input.owner);
  const createDestinationAta = getCreateAssociatedTokenIdempotentInstruction({
    payer: signer,
    ata: destinationAta,
    owner: input.destination,
    mint: USDC,
  });
  const transfer = getTransferInstruction({
    source: sourceAta,
    destination: destinationAta,
    authority: signer,
    amount: input.amountRaw,
  });
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.owner, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions([createDestinationAta, transfer], m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}
