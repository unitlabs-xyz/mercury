import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getTransactionEncoder,
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

export interface FundTransferInput {
  /** The connected wallet. Pays the fee, pays the rent, and signs. */
  readonly from: Address;
  /** The Mercury wallet, not its token account; the account is derived. */
  readonly to: Address;
  /** In USDC's own units, so 20_000_000 is $20. */
  readonly amountRaw: bigint;
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
}

/**
 * Money into a Mercury wallet, out of a wallet somebody already holds.
 *
 * The mirror of `relay/transfer.ts` on the server, with the one difference
 * that matters: there the relayer pays, because a Privy wallet holding only
 * USDC cannot pay for its own transfer. Here the funding wallet pays, because
 * it is a wallet somebody chose to connect and it holds its own SOL. So
 * nothing of ours signs, nothing of ours is owed, and there is no fee to
 * quote, repay or explain.
 *
 * Which also means this builds a transaction and stops. It does not send it:
 * the connected wallet does that, and the deposit is picked up by
 * `wallet-events` on the server the same way any other inbound USDC is — as a
 * transfer in, with no route of its own. There is nothing to tell the API.
 *
 * Why build it at all rather than show an address: an address is a thing
 * somebody can send the wrong asset to, on the wrong network, which is exactly
 * what `useUsdcAck` exists to guard against. A transaction we build cannot be
 * wrong about either. The mint and the network are not the sender's to choose.
 */
export const buildFundTransfer = async (input: FundTransferInput): Promise<Uint8Array> => {
  const ata = (owner: Address) =>
    findAssociatedTokenPda({ owner, mint: USDC, tokenProgram: TOKEN_PROGRAM_ADDRESS }).then(([a]) => a);
  const [source, destination] = await Promise.all([ata(input.from), ata(input.to)]);

  /*
   * A noop signer because the signature is produced in the wallet, after this.
   * The message has to name the funder without holding their key.
   */
  const funder = createNoopSigner(input.from);

  /*
   * Idempotent, and the reason this is two instructions rather than one. A
   * first-ever deposit has to open the Mercury wallet's USDC account; every
   * one after it must not fail for finding the account already there. Reading
   * first and branching would just be a race with a slower spelling.
   */
  const open = getCreateAssociatedTokenIdempotentInstruction({
    payer: funder,
    ata: destination,
    owner: input.to,
    mint: USDC,
  });
  const transfer = getTransferInstruction({
    source,
    destination,
    authority: funder,
    amount: input.amountRaw,
  });

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.from, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions([open, transfer], m),
  );

  /*
   * Bytes, not the base64 the server's relay path returns: Privy's
   * `signAndSendTransaction` takes a Uint8Array. Handing it a string
   * typechecks against `unknown` and fails inside the wallet instead.
   */
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
};
