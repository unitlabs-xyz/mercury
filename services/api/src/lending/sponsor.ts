import { getU32Encoder, getU64Encoder, type Address, type Instruction } from "@solana/kit";

/**
 * Sponsoring a loan for a wallet that holds no SOL.
 *
 * The relayer pays the network fee by being the fee payer. Rent is the other
 * cost, and Kamino takes it from the owner: its first-time setup creates the
 * user's metadata, lookup table and obligation, and a borrow may create the
 * USDC account the loan lands in, all paid for by the wallet. A Privy wallet
 * that has never held SOL does not exist on chain at all, so those fail with
 * `AccountNotFound` before any program runs.
 *
 * So the relayer tops the wallet up, in the same transaction, by what that
 * transaction will spend from it — and, the first time, by the minimum a
 * wallet needs to exist, which is what creates it. Atomic: the SOL arrives
 * exactly when the instructions that use it run, or not at all.
 */

export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/** What a system account with no data needs to hold to exist: rent exemption at zero bytes. */
export const WALLET_RENT_EXEMPT = 890_880n;

/** A classic SPL token account, 165 bytes. USDC's. */
export const TOKEN_ACCOUNT_RENT = 2_039_280n;

/**
 * A Token-2022 account, as xStocks use, with room for the extensions they carry.
 * Generous on purpose: this is only used where the transaction cannot be
 * simulated, and anything over the real figure stays in the user's wallet.
 */
export const TOKEN_2022_ACCOUNT_RENT = 3_000_000n;

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
 */
export const topUp = (balance: bigint, spend: bigint): bigint => {
  if (spend <= 0n) return 0n;
  const short = spend + WALLET_RENT_EXEMPT - balance;
  return short > 0n ? short : 0n;
};

/**
 * Token accounts an instruction list would create, as `[account, token program]`.
 *
 * The associated-token program's `Create` and `CreateIdempotent` both take
 * the new account second and the token program sixth. Which ones actually
 * get created depends on what already exists, which the caller checks.
 */
export const tokenAccountsCreatedBy = (
  ixs: readonly Instruction[],
): readonly { readonly account: Address; readonly tokenProgram: Address }[] =>
  ixs.flatMap((ix) => {
    if (ix.programAddress !== ASSOCIATED_TOKEN_PROGRAM) return [];
    const kind = ix.data === undefined || ix.data.length === 0 ? 0 : ix.data[0];
    if (kind !== 0 && kind !== 1) return [];
    const account = ix.accounts?.[1]?.address;
    const tokenProgram = ix.accounts?.[5]?.address;
    return account === undefined || tokenProgram === undefined ? [] : [{ account, tokenProgram }];
  });

/** Rent for the token accounts that do not exist yet. */
export const rentForMissing = (
  created: readonly { readonly account: Address; readonly tokenProgram: Address }[],
  exists: ReadonlySet<string>,
): bigint => {
  const seen = new Set<string>();
  let rent = 0n;
  for (const { account, tokenProgram } of created) {
    if (exists.has(account) || seen.has(account)) continue;
    seen.add(account);
    rent += tokenProgram === TOKEN_PROGRAM ? TOKEN_ACCOUNT_RENT : TOKEN_2022_ACCOUNT_RENT;
  }
  return rent;
};
