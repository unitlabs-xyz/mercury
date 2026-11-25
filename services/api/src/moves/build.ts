import {
  address,
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
  type Instruction,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";

/** One token to move: where it sits now, how much, and which program it lives under. */
export interface MoveToken {
  readonly mint: string;
  /** The linked wallet's own token account holding it: the source of the transfer. */
  readonly source: string;
  /** The classic token program, or Token-2022 for xStocks. */
  readonly programId: string;
  readonly decimals: number;
  readonly amountRaw: bigint;
}

export interface MoveInput {
  /** The linked wallet: signs each transfer, and pays the network fee and any rent, in SOL. */
  readonly owner: string;
  /** The person's Mercury wallet, which receives every token. */
  readonly destination: string;
  readonly tokens: readonly MoveToken[];
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
}

export interface MoveBatch {
  readonly wire: string;
  readonly messageBytes: Uint8Array;
  /** What this transaction moves, as it lands in the Mercury wallet. */
  readonly moved: readonly { readonly mint: string; readonly amountRaw: bigint }[];
}

/**
 * About four tokens to a transaction. One transaction that empties a wallet
 * is what a drainer sends, and a wallet's security scanner may flag it; a few
 * small ones, approved together, are not that shape and still ask only once.
 */
export const TOKENS_PER_TRANSACTION = 4;

/**
 * The transactions that move a linked wallet's tokens into the person's
 * Mercury wallet: for each token, the Mercury wallet's account opened if it
 * lacks one, then the transfer from the linked wallet's own account. The
 * linked wallet is the fee payer and pays the rent of what it opens, so it
 * signs alone and nothing is Mercury's to pay or to be repaid (see
 * `planMove`). Nothing else is in them: no Mercury fee on a move between a
 * person's own wallets.
 *
 * `transferChecked` names the mint and its decimals, which Token-2022 requires
 * and the classic program accepts, so one instruction serves both.
 */
export const buildMove = async (input: MoveInput): Promise<readonly MoveBatch[]> => {
  const owner = createNoopSigner(address(input.owner));

  const batches: MoveBatch[] = [];
  for (let i = 0; i < input.tokens.length; i += TOKENS_PER_TRANSACTION) {
    const chunk = input.tokens.slice(i, i + TOKENS_PER_TRANSACTION);
    const instructions: Instruction[] = [];
    const moved: { mint: string; amountRaw: bigint }[] = [];

    for (const t of chunk) {
      const mint = address(t.mint);
      const program = address(t.programId);
      const [destination] = await findAssociatedTokenPda({
        owner: address(input.destination),
        mint,
        tokenProgram: program,
      });
      instructions.push(
        getCreateAssociatedTokenIdempotentInstruction({
          payer: owner,
          ata: destination,
          owner: address(input.destination),
          mint,
          tokenProgram: program,
        }),
        getTransferCheckedInstruction(
          {
            source: address(t.source),
            mint,
            destination,
            authority: owner,
            amount: t.amountRaw,
            decimals: t.decimals,
          },
          { programAddress: program },
        ),
      );
      moved.push({ mint: t.mint, amountRaw: t.amountRaw });
    }

    const compiled = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(input.owner as Address, m),
        (m) =>
          setTransactionMessageLifetimeUsingBlockhash(
            { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
            m,
          ),
        (m) => appendTransactionMessageInstructions(instructions, m),
      ),
    );
    batches.push({
      wire: getBase64EncodedWireTransaction(compiled),
      messageBytes: compiled.messageBytes as unknown as Uint8Array,
      moved,
    });
  }
  return batches;
};
