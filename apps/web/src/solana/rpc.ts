import { address, createSolanaRpc, type Address, type Signature } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

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
 * `solana.publicnode.com`, not `solana-rpc.publicnode.com`. Both serve the
 * same JSON-RPC over HTTPS, but the `-rpc` host answers a websocket upgrade
 * with a 301 to this one, and a redirect is not something a websocket
 * handshake survives — so Privy's subscriptions, which take this URL with
 * `http` swapped for `ws`, never connected. Measured 15 October 2026.
 *
 * Two limits, both measured the same day, and both load-bearing below:
 * `getTokenAccountsByOwner` is refused outright with a 403, and
 * `getMultipleAccounts` is refused past **ten** addresses in one call.
 */
export const PUBLIC_SOLANA_RPC_URL = "https://solana.publicnode.com";

/** The most addresses `getMultipleAccounts` takes on the public endpoint. */
const PUBLIC_BATCH = 10;

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

/** The parsed shape of a token account, which is all this reads of it. */
interface ParsedTokenAccount {
  readonly parsed?: { readonly info?: { readonly tokenAmount?: { readonly amount?: string } } };
}

/**
 * What a wallet holds of a token, in the token's own units.
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

/** The SPL Token-2022 program, which xStocks and other newer mints live under. */
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address;

/** Native SOL, in Relay's spelling: the system program's address. */
/**
 * Whether a signature is on chain and did not fail.
 *
 * Asked of the chain, because the alternative is believing a confirmation
 * that gave up. Relay's Solana adapter confirms a deposit by subscribing to
 * the signature *after* sending it, and wallets like Phantom do not return
 * until the transaction is already confirmed — so the status it is waiting
 * for has often changed before it starts listening, nothing ever arrives, and
 * sixty seconds later the block height passes and web3.js throws
 * `TransactionExpiredBlockheightExceededError`. The money moved; only the
 * listener missed it. Observed 15 October 2026 on a deposit that `finalized`
 * with `err: null` while the panel showed it as failed.
 *
 * `searchTransactionHistory`, since by the time this is asked the signature
 * may have left the recent-status cache.
 *
 * `false` rather than a throw when the lookup itself fails: this is only ever
 * asked in order to second-guess an error, and an unreachable endpoint is no
 * evidence the deposit survived.
 */
export const signatureSucceeded = async (signature: string): Promise<boolean> => {
  try {
    return await viaRpc(async (rpc) => {
      const { value } = await rpc
        .getSignatureStatuses([signature as Signature], { searchTransactionHistory: true })
        .send();
      const status = value[0];
      if (status === null || status === undefined) return false;
      return status.err === null && status.confirmationStatus !== "processed";
    });
  } catch {
    return false;
  }
};

export const SOL_NATIVE = "11111111111111111111111111111111";

/** One thing a wallet holds: the mint, the raw amount, and its decimals. */
export interface Holding {
  readonly mint: string;
  readonly amount: bigint;
  readonly decimals: number;
}

type ParsedHolding = {
  parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } };
};

const holdingOf = (data: unknown): Holding | null => {
  const info = (data as ParsedHolding).parsed?.info;
  const amount = info?.tokenAmount?.amount;
  const decimals = info?.tokenAmount?.decimals;
  if (info?.mint === undefined || amount === undefined || decimals === undefined) return null;
  const raw = BigInt(amount);
  return raw > 0n ? { mint: info.mint, amount: raw, decimals } : null;
};

/**
 * Everything a Solana wallet holds that has a balance: SOL, and every token
 * account under both token programs.
 *
 * Listed with `getTokenAccountsByOwner` where the endpoint serves it, which is
 * the only way to find tokens nobody asked about. The public fallback refuses
 * indexed methods, so there the answer narrows to `known` — the mints already
 * on screen — read through their derived accounts with `getMultipleAccounts`,
 * which every endpoint serves. Narrower, but never wrong: a wallet holding
 * something off-screen simply does not have it raised to the top.
 */
export const walletHoldings = async (owner: string, known: readonly string[]): Promise<Holding[]> => {
  const sol = await solBalanceRaw(owner);
  const native: Holding[] = sol > 0n ? [{ mint: SOL_NATIVE, amount: sol, decimals: 9 }] : [];

  const tokens = await viaRpc(async (rpc) => {
    try {
      const lists = await Promise.all(
        [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM].map((programId) =>
          rpc.getTokenAccountsByOwner(address(owner), { programId }, { encoding: "jsonParsed" }).send(),
        ),
      );
      return lists.flatMap((l) => l.value.map((a) => holdingOf(a.account.data))).filter((h) => h !== null);
    } catch {
      const mints = known.filter((m) => m !== SOL_NATIVE);
      const atas = await Promise.all(
        mints.flatMap((mint) =>
          [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM].map(async (tokenProgram) => {
            const [ata] = await findAssociatedTokenPda({
              owner: address(owner),
              mint: mint as Address,
              tokenProgram,
            });
            return ata;
          }),
        ),
      );
      /*
       * Ten at a time, which is what the public endpoint serves: eleven
       * addresses in one `getMultipleAccounts` come back 403 "Request
       * blocked". Chunking at 100 — the figure the method itself allows —
       * meant this fallback had never once worked on the endpoint it exists
       * for, so a refused `getTokenAccountsByOwner` was followed straight by
       * a second refusal. Measured 15 October 2026.
       */
      const found: Holding[] = [];
      for (let i = 0; i < atas.length; i += PUBLIC_BATCH) {
        const { value } = await rpc
          .getMultipleAccounts(atas.slice(i, i + PUBLIC_BATCH), { encoding: "jsonParsed" })
          .send();
        for (const account of value) {
          const h = account === null ? null : holdingOf(account.data);
          if (h !== null) found.push(h);
        }
      }
      return found;
    }
  });

  return [...native, ...tokens];
};
