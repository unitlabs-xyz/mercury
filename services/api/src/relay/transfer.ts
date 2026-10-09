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
import { USDC_DECIMALS } from "@mercury/chain";
import { Decimal } from "@mercury/core";

const USDC = USDC_MINT as Address;

/**
 * A USDC transfer the sender can make with no SOL at all.
 *
 * The wallet-paid version of this is the same three accounts and a different
 * fee payer, and that one difference is the whole cliff: a Privy wallet that
 * has only ever held USDC does not exist on chain, so it cannot pay a network
 * fee and cannot pay the rent to open the recipient's USDC account. Both of
 * those were charged to the sender, which meant the one asset we ask people to
 * hold was the one asset that could not move.
 *
 * So the relayer pays, and is repaid only for the rent — see `transferFee`.
 * Repayment rides in the same message, because separately a sender could take
 * the transfer and never send it back.
 */

export interface SponsoredTransferInput {
  /** The sender. Signs for the transfer, and never pays the network. */
  readonly owner: Address;
  /** The recipient's wallet, not their token account; the account is derived. */
  readonly destination: Address;
  /** In USDC's own units, so 20_000_000 is $20. */
  readonly amountRaw: bigint;
  /** Pays the fee and the rent, and signs last. */
  readonly relayer: Address;
  /** What the sender repays, in USDC. Zero skips the transfer entirely. */
  readonly feeUsdc: Decimal;
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
}

/**
 * USDC has six decimals, so $0.22 is 220000 of them.
 *
 * Rounded down (`Decimal.ROUND_DOWN` is 1; 0 is ROUND_UP), because the figure
 * arriving here has already been rounded up to the cent when it was quoted.
 * Rounding up twice would charge a unit the sender was never shown.
 */
const toBaseUnits = (usdc: Decimal): bigint =>
  BigInt(usdc.mul(10 ** USDC_DECIMALS).toFixed(0, Decimal.ROUND_DOWN));

export const buildSponsoredTransfer = async (
  input: SponsoredTransferInput,
): Promise<{ wire: string; messageBytes: Uint8Array }> => {
  const ata = (owner: Address) =>
    findAssociatedTokenPda({ owner, mint: USDC, tokenProgram: TOKEN_PROGRAM_ADDRESS }).then(([a]) => a);
  const [source, destination, repayTo] = await Promise.all([
    ata(input.owner),
    ata(input.destination),
    ata(input.relayer),
  ]);

  /*
   * The sender signs in the browser and the relayer signs here, so both are
   * noop signers at compile time: the message has to name them without either
   * key being present to produce a signature yet.
   */
  const sender = createNoopSigner(input.owner);

  /*
   * Idempotent, and paid for by the relayer. Idempotent because whether the
   * recipient holds USDC is read a moment before this and could change inside
   * that moment; paid by the relayer because a sender with no SOL is the entire
   * reason this function exists.
   */
  const open = getCreateAssociatedTokenIdempotentInstruction({
    payer: createNoopSigner(input.relayer),
    ata: destination,
    owner: input.destination,
    mint: USDC,
  });
  const transfer = getTransferInstruction({
    source,
    destination,
    authority: sender,
    amount: input.amountRaw,
  });

  /*
   * Repayment last, which for a transfer is only a reading order: both halves
   * move dollars the sender already holds, so neither depends on the other
   * having run. A sender short of the total fails either way, and atomically.
   */
  const base = toBaseUnits(input.feeUsdc);
  const repay =
    base === 0n
      ? []
      : [getTransferInstruction({ source, destination: repayTo, authority: sender, amount: base })];

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.relayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions([open, transfer, ...repay], m),
  );

  const compiled = compileTransaction(message);
  return {
    wire: getBase64EncodedWireTransaction(compiled),
    messageBytes: compiled.messageBytes as unknown as Uint8Array,
  };
};
