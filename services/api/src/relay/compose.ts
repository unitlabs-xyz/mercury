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
 * One transaction that buys the stock and pays us back for the gas.
 *
 * Both halves have to be in the same message. Separately, a buyer could take
 * the swap and never send the fee, or send the fee for a swap that then fails
 * — either way somebody is out of pocket for something that did not happen.
 * Together they are one atomic thing: the charge lands exactly when the buy
 * does.
 */

/** Jupiter returns instructions as JSON; this is the shape it uses. */
export interface JupiterInstruction {
  readonly programId: string;
  readonly accounts: readonly {
    readonly pubkey: string;
    readonly isSigner: boolean;
    readonly isWritable: boolean;
  }[];
  readonly data: string;
}

/*
 * Kit packs writability and signing into one number: bit 0 writable, bit 1
 * signer. Jupiter sends them as two booleans.
 */
export const toInstruction = (ix: JupiterInstruction): Instruction => ({
  programAddress: ix.programId as Address,
  accounts: ix.accounts.map((a) => ({
    address: a.pubkey as Address,
    role: ((a.isWritable ? 1 : 0) | (a.isSigner ? 2 : 0)) as 0 | 1 | 2 | 3,
  })),
  data: Uint8Array.from(Buffer.from(ix.data, "base64")),
});

export interface ComposeInput {
  /** Pays the fee and the rent, and signs last. */
  readonly relayer: Address;
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
  /** Compute budget first, then the charge, then the swap. */
  readonly computeBudget: readonly Instruction[];
  readonly charge: Instruction | null;
  readonly swap: readonly Instruction[];
  /** Resolved tables. Without them a real route will not fit in 1232 bytes. */
  readonly lookupTables: ReadonlyMap<Address, readonly Address[]>;
}

/**
 * The charge goes before the swap.
 *
 * Both land or neither does, so ordering cannot change who ends up paying.
 * It is first because the buyer's USDC is spent by the swap: taking the fee
 * from the balance before it moves means the amount quoted to them and the
 * amount swapped are the same number, rather than depending on what the swap
 * happened to leave behind.
 */
export const composeSponsored = (input: ComposeInput): { wire: string; messageBytes: Uint8Array } => {
  const instructions = [
    ...input.computeBudget,
    ...(input.charge === null ? [] : [input.charge]),
    ...input.swap,
  ];

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.relayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) =>
      input.lookupTables.size === 0
        ? m
        : compressTransactionMessageUsingAddressLookupTables(
            m,
            // The compressor wants a plain object of mutable arrays.
            Object.fromEntries([...input.lookupTables].map(([table, addresses]) => [table, [...addresses]])),
          ),
  );

  const compiled = compileTransaction(message);
  return {
    wire: getBase64EncodedWireTransaction(compiled),
    messageBytes: compiled.messageBytes as unknown as Uint8Array,
  };
};
