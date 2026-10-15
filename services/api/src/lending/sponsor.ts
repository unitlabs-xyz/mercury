import { getU32Encoder, getU64Encoder, type Address, type Instruction } from "@solana/kit";

/**
 * Sponsoring a loan for a wallet that holds no SOL.
 *
 * The relayer pays the network fee by being the fee payer. Rent is the other
 * cost, and Kamino takes it from the owner: its first-time setup creates the
 * user's metadata, obligation and farm state, and a borrow may create the USDC
 * account the loan lands in, all paid for by the wallet. A Privy wallet that
 * has never held SOL does not exist on chain at all, so those fail with
 * `AccountNotFound` before any program runs.
 *
 * So the relayer tops the wallet up, in the same transaction, by what that
 * transaction will spend from it — and, the first time, by the minimum a
 * wallet needs to exist, which is what creates it. Atomic: the SOL arrives
 * exactly when the instructions that use it run, or not at all. A first
 * loan's setup is in that same transaction, so Mercury pays for an account
 * only when a loan lands with it.
 */

export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;

/** System program `Transfer`: instruction 2, then the lamports. */
export const transferSol = (from: Address, to: Address, lamports: bigint): Instruction => ({
  programAddress: SYSTEM_PROGRAM,
  accounts: [
    { address: from, role: 3 },
    { address: to, role: 1 },
  ],
  data: new Uint8Array([...getU32Encoder().encode(2), ...getU64Encoder().encode(lamports)]),
});

/**
 * How much to send so a wallet holding `balance` can spend `spend` and still
 * exist afterwards.
 *
 * Nothing when the transaction spends nothing: a wallet with no SOL that is
 * only repaying needs no rent, and creating it anyway would be a gift. And
 * never less than rent exemption once something is spent, because a wallet
 * left between zero and that minimum is a state the runtime refuses.
 *
 * `walletRent` is that minimum as the node says today (see `rent.ts`). It was
 * a constant, set when mainnet charged 6,960 lamports a byte, and it left every
 * new wallet over a third more SOL than it needed once the rate fell to 5,080.
 */
export const topUp = (balance: bigint, spend: bigint, walletRent: bigint): bigint => {
  if (spend <= 0n) return 0n;
  const short = spend + walletRent - balance;
  return short > 0n ? short : 0n;
};
