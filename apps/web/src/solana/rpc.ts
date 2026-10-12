import { address, createSolanaRpc, type Address, type Blockhash } from "@solana/kit";
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
 * Asked by owner and mint rather than by deriving the account and reading its
 * balance, because of what the two do when there is nothing to report.
 * `getTokenAccountBalance` *throws* for an account that does not exist — the
 * same way it throws when the RPC is out of quota, or refuses the method, or
 * cannot be reached — so catching that to answer zero makes a wallet nobody
 * could read indistinguishable from a wallet holding nothing. It showed
 * "Balance: 0" for a wallet with 5.69 USDC in it, against an RPC that was
 * answering 429 to everything, and said nothing about why.
 *
 * This answers an empty list instead, which is a real zero and not an error at
 * all. Everything that is an error now throws, reaches react-query, and is
 * shown as what it is.
 *
 * Summing is not defensive padding: USDC usually sits in the associated
 * account, but nothing stops a wallet holding several, and the figure Max
 * offers should be what the wallet can actually send.
 */
export const usdcBalanceRaw = async (owner: string): Promise<bigint> => {
  const { value } = await rpc()
    .getTokenAccountsByOwner(address(owner), { mint: USDC_MINT as Address }, { encoding: "jsonParsed" })
    .send();
  return value.reduce(
    (sum, account) => sum + BigInt(account.account.data.parsed.info.tokenAmount.amount),
    0n,
  );
};
