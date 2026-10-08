import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  type Address,
  type Instruction,
} from "@solana/kit";

/**
 * Legacy helpers for the relayer's sponsor-fee transfer. Wallet sends and
 * basket funding use the compatible `@solana-program/token` client; keep this
 * fee instruction unchanged until the relayer is migrated separately.
 */

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** `Transfer` is instruction 3 of the token program. */
const TRANSFER = 3;

/**
 * Where a wallet's balance of a mint actually lives.
 *
 * A wallet address holds no tokens itself; each mint gets its own account at
 * an address derived from the pair. This is the derivation every Solana tool
 * agrees on, so the answer is checkable against chain.
 */
export const associatedTokenAddress = async (owner: Address, mint: Address): Promise<Address> => {
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [encoder.encode(owner), encoder.encode(TOKEN_PROGRAM), encoder.encode(mint)],
  });
  return pda;
};

export interface TransferInput {
  readonly source: Address;
  readonly destination: Address;
  /** The wallet that owns `source`, and signs for it. */
  readonly owner: Address;
  /** In the mint's own units: 6 decimals for USDC, so 250000 is $0.25. */
  readonly amount: bigint;
}

/**
 * Move tokens between two accounts of the same mint.
 *
 * `Transfer` rather than `TransferChecked`: the destination is an address this
 * server derived from a mint it chose, so there is no mint to confirm that we
 * did not already decide.
 */
export const transferInstruction = (input: TransferInput): Instruction => ({
  programAddress: TOKEN_PROGRAM,
  accounts: [
    { address: input.source, role: 1 },
    { address: input.destination, role: 1 },
    { address: input.owner, role: 3 },
  ],
  data: new Uint8Array([TRANSFER, ...getU64Encoder().encode(input.amount)]),
});
