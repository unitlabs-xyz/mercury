import { address, createSolanaRpc, type Address, type Blockhash } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { USDC_MINT } from "@mercury/chain";

/**
 * The browser's own read path, for the two things a connected wallet needs
 * that our API cannot answer.
 *
 * Our API reads the Mercury wallet. It has no business reading somebody's
 * Phantom — that wallet is not an account we keep, nobody has asked us to
 * watch it, and routing the read through the server would mean telling the
 * server about a wallet whose only involvement is paying once and leaving.
 *
 * Same endpoint Privy signs through, for the reason given in `PrivyBoundary`:
 * Solana's public RPC answers the CORS preflight and then 403s anything with
 * an Origin header, so there is no keyless default that works in a browser.
 */
const RPC_URL = import.meta.env["VITE_SOLANA_RPC_URL"] as string | undefined;

/* Built once. A client per render would open a connection per render. */
let client: ReturnType<typeof createSolanaRpc> | null = null;

const rpc = () => {
  if (RPC_URL === undefined) throw new Error("VITE_SOLANA_RPC_URL is not set");
  client ??= createSolanaRpc(RPC_URL);
  return client;
};

export interface Lifetime {
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
}

/**
 * Read as late as possible, because it starts expiring immediately: roughly
 * 60 to 90 seconds, and the clock runs while somebody reads their wallet's
 * confirmation screen.
 */
export const latestBlockhash = async (): Promise<Lifetime> => {
  const { value } = await rpc().getLatestBlockhash({ commitment: "confirmed" }).send();
  return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
};

/**
 * What a wallet holds in USDC, in USDC's own units.
 *
 * Zero for a wallet that has never held any: `getTokenAccountBalance` fails
 * rather than answering zero for an account that does not exist, and "no
 * account" and "an empty account" are the same answer to the only question
 * being asked here.
 */
export const usdcBalanceRaw = async (owner: string): Promise<bigint> => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: USDC_MINT as Address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  try {
    const { value } = await rpc().getTokenAccountBalance(ata).send();
    return BigInt(value.amount);
  } catch {
    return 0n;
  }
};
