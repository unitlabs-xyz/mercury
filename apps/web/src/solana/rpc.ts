import { address, createSolanaRpc, type Address, type Blockhash } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { USDC_MINT } from "@mercury/chain";

/**
 * The endpoint to fall back to, hardcoded because a fallback that has to be
 * configured is not one.
 *
 * Not `api.mainnet-beta.solana.com`, which is the obvious choice and does not
 * work: it answers the CORS preflight with an allow and then returns 403 to
 * any request carrying an Origin header, so it fails in a browser and only in
 * a browser. Measured again on 12 October 2026, along with Ankr (403 without a
 * key), dRPC (400, chain not on the free tier) and BlockEden (402). This one
 * answered 200 with `access-control-allow-origin: *`.
 *
 * Its limit is that indexed methods — `getTokenAccountsByOwner` and friends —
 * are refused without a token, which is why the balance below is read through
 * `getAccountInfo` on a derived account instead. Everything here has to stay
 * inside that restriction to be worth having.
 */
export const PUBLIC_SOLANA_RPC_URL = "https://solana-rpc.publicnode.com";

const CONFIGURED = import.meta.env["VITE_SOLANA_RPC_URL"] as string | undefined;

/**
 * Tried in order, de-duplicated so a deployment that configures the public
 * endpoint does not ask it twice before giving up.
 */
const ENDPOINTS: readonly string[] = [
  ...new Set([CONFIGURED, PUBLIC_SOLANA_RPC_URL].filter((url): url is string => Boolean(url))),
];

/**
 * What the app signs through, and what it reads through first.
 *
 * `VITE_SOLANA_RPC_URL` is no longer required. It is still strongly wanted: the
 * public endpoint is rate limited, shared with everyone, and refuses indexed
 * methods, so it is a floor rather than a plan.
 */
export const SOLANA_RPC_URL: string = ENDPOINTS[0]!;

/* One client per endpoint, built once. A client per render would open a connection per render. */
const clients = new Map<string, ReturnType<typeof createSolanaRpc>>();
const clientFor = (url: string) => {
  const existing = clients.get(url);
  if (existing !== undefined) return existing;
  const made = createSolanaRpc(url);
  clients.set(url, made);
  return made;
};

/**
 * The same call against each endpoint in turn.
 *
 * Written after a configured Alchemy key hit its monthly limit and answered 429
 * to everything, which left a connected wallet reading as empty. A key can run
 * out, a provider can have an afternoon, and neither is a reason for the app to
 * be wrong about somebody's balance.
 *
 * The last failure is what surfaces, because the last endpoint is the one with
 * no excuse left. A call that succeeds anywhere never raises anything.
 */
const viaRpc = async <T>(run: (rpc: ReturnType<typeof createSolanaRpc>) => Promise<T>): Promise<T> => {
  let last: unknown = new Error("No Solana RPC endpoint is configured");
  for (const url of ENDPOINTS) {
    try {
      return await run(clientFor(url));
    } catch (error: unknown) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
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
export const latestBlockhash = (): Promise<Lifetime> =>
  viaRpc(async (rpc) => {
    const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
  });

/** The parsed shape of a token account, which is all this reads of it. */
interface ParsedTokenAccount {
  readonly parsed?: { readonly info?: { readonly tokenAmount?: { readonly amount?: string } } };
}

/**
 * What a wallet holds in USDC, in USDC's own units.
 *
 * Read with `getAccountInfo` on the derived account, for two reasons that both
 * came from getting it wrong. `getTokenAccountBalance` *throws* for an account
 * that does not exist, exactly as it throws when the RPC refuses the call, so
 * catching that to answer zero made a wallet nobody could read look like a
 * wallet holding nothing — it showed "Balance: 0" against a wallet holding
 * 5.69 USDC. And `getTokenAccountsByOwner`, which answers an empty list
 * instead, is an indexed method that the public endpoint will not serve.
 *
 * `getAccountInfo` is neither: a missing account is `null` rather than an
 * error, and a plain account lookup is served by every endpoint. So an empty
 * wallet reads as zero, and everything that is a failure stays one and is
 * shown as what it is.
 */
export const tokenBalanceRaw = async (owner: string, mint: string): Promise<bigint> => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: mint as Address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return viaRpc(async (rpc) => {
    const { value } = await rpc.getAccountInfo(ata, { encoding: "jsonParsed" }).send();
    /* Never held it, which is a balance of zero and not a failure to read one. */
    if (value === null) return 0n;
    const amount = (value.data as ParsedTokenAccount).parsed?.info?.tokenAmount?.amount;
    /* An account at that address that is not a token account: not ours to read. */
    return amount === undefined ? 0n : BigInt(amount);
  });
};

export const usdcBalanceRaw = (owner: string): Promise<bigint> => tokenBalanceRaw(owner, USDC_MINT);

/**
 * Native SOL, which is a lamport balance and not a token account.
 *
 * Its own function because SOL is the one thing somebody is likely to want to
 * deposit that has no associated token account at all — reading it through
 * `tokenBalanceRaw` would derive an address for wrapped SOL that almost nobody
 * holds and answer a confident zero.
 */
export const solBalanceRaw = (owner: string): Promise<bigint> =>
  viaRpc(async (rpc) => {
    const { value } = await rpc.getBalance(address(owner)).send();
    return BigInt(value);
  });
