import {
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";

/**
 * A Solana-origin Relay swap, as one transaction the funder signs and pays for.
 *
 * Deliberately not `relay/compose.ts`'s `composeSponsored`. That one names our
 * relayer as fee payer and carries a USDC repayment, because the account it
 * serves is a Privy wallet that may hold no SOL. This serves the opposite case:
 * a wallet somebody already funds themselves, holding arbitrary tokens, which
 * is by definition an account with SOL in it. Nothing is sponsored here and the
 * relayer's exposure does not grow.
 *
 * Relay's instructions already deliver to the `recipient` named in the quote,
 * so there is no transfer to append — which is the whole reason the server
 * mints the quote. A client-minted one could name any recipient it liked.
 */

/**
 * One instruction as Relay serialises it.
 *
 * `keys`, not `accounts` — Jupiter uses the latter and `relay/compose.ts`'s
 * `toInstruction` reads it. The two are otherwise identical, and feeding one
 * shape to the other's reader produces a transaction with no accounts and a
 * failure the chain explains badly.
 */
export interface RelayWireInstruction {
  readonly programId: string;
  readonly keys: readonly {
    readonly pubkey: string;
    readonly isSigner: boolean;
    readonly isWritable: boolean;
  }[];
  readonly data: string;
}

/* Kit packs writability and signing into one number: bit 0 writable, bit 1 signer. */
export const relayInstruction = (ix: RelayWireInstruction): Instruction => ({
  programAddress: ix.programId as Address,
  accounts: ix.keys.map((k) => ({
    address: k.pubkey as Address,
    role: ((k.isWritable ? 1 : 0) | (k.isSigner ? 2 : 0)) as 0 | 1 | 2 | 3,
  })),
  data: Uint8Array.from(Buffer.from(ix.data, "base64")),
});

export interface FundSwapInput {
  /** The connected wallet. Signs, and pays its own network fee. */
  readonly payer: Address;
  readonly instructions: readonly RelayWireInstruction[];
  /** Resolved tables. Without them a real route will not fit in 1232 bytes. */
  readonly lookupTables: ReadonlyMap<Address, readonly Address[]>;
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
}

export const composeFundSwap = (input: FundSwapInput): { wire: string; messageBytes: Uint8Array } => {
  if (input.instructions.length === 0) {
    throw new Error("relay returned no instructions for this route");
  }

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions(input.instructions.map(relayInstruction), m),
    (m) =>
      input.lookupTables.size === 0
        ? m
        : compressTransactionMessageUsingAddressLookupTables(
            m,
            /* The compressor wants a plain object of mutable arrays. */
            Object.fromEntries([...input.lookupTables].map(([table, addrs]) => [table, [...addrs]])),
          ),
  );

  const compiled = compileTransaction(message);
  return {
    wire: getBase64EncodedWireTransaction(compiled),
    messageBytes: compiled.messageBytes as unknown as Uint8Array,
  };
};
