import { D, ONE, type Decimal } from "@mercury/core";
import type {
  ChainHistory,
  ChainReader,
  MintConfig,
  SignaturePage,
  SignatureRef,
  TokenBalance,
  TokenBalanceEntry,
  TokenTransfer,
  TransactionDetail,
} from "../ports.js";
import { batchedRpc } from "./batch.js";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface ParsedTokenAccount {
  readonly account: {
    readonly data: {
      readonly parsed: {
        readonly info: {
          readonly mint: string;
          readonly tokenAmount: { readonly amount: string; readonly decimals: number };
        };
      };
    };
  };
}

interface ParsedMint {
  readonly data: {
    readonly parsed?: {
      readonly info?: {
        readonly decimals?: number;
        readonly extensions?: readonly {
          readonly extension: string;
          readonly state?: Record<string, unknown>;
        }[];
      };
    };
  };
}

interface RpcSignature {
  readonly signature: string;
  readonly slot: number;
  readonly blockTime: number | null;
  readonly err: unknown;
}

interface RpcTokenBalance {
  readonly accountIndex: number;
  readonly mint: string;
  readonly owner?: string;
  readonly uiTokenAmount: { readonly amount: string; readonly decimals: number };
}

interface RpcParsedInstruction {
  readonly programId: string;
  readonly parsed?: {
    readonly type?: string;
    readonly info?: Record<string, unknown>;
  };
}

interface RpcTransaction {
  readonly blockTime: number | null;
  readonly transaction: {
    readonly message: {
      readonly accountKeys: readonly { readonly pubkey: string }[];
      readonly instructions?: readonly RpcParsedInstruction[];
    };
  };
  readonly meta: {
    /** Null on success; an object naming the instruction that failed otherwise. */
    readonly err?: unknown;
    readonly fee: number;
    readonly preBalances: readonly number[];
    readonly postBalances: readonly number[];
    readonly preTokenBalances?: readonly RpcTokenBalance[];
    readonly postTokenBalances?: readonly RpcTokenBalance[];
    readonly innerInstructions?: readonly {
      readonly index: number;
      readonly instructions: readonly RpcParsedInstruction[];
    }[];
  } | null;
}

/**
 * The ceiling the node compares a transaction's version against, not an
 * assertion about what exists. A transaction above it returns an error rather
 * than a result, and version 1 is already 14% of a mainnet block — so 0 would
 * park a cursor forever on the first one the walk met.
 */
const MAX_TX_VERSION = 255;

const toEntry = (b: RpcTokenBalance): TokenBalanceEntry => ({
  mint: b.mint,
  owner: b.owner ?? null,
  rawAmount: BigInt(b.uiTokenAmount.amount),
  decimals: b.uiTokenAmount.decimals,
});

const stringAt = (value: unknown): string | null => (typeof value === "string" ? value : null);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

function tokenTransfersIn(
  instructions: readonly RpcParsedInstruction[],
  keys: readonly string[],
  balances: readonly RpcTokenBalance[],
): readonly TokenTransfer[] {
  const accounts = new Map<string, { mint: string; owner: string | null; decimals: number }>();
  for (const balance of balances) {
    const address = keys[balance.accountIndex];
    if (address === undefined) continue;
    accounts.set(address, {
      mint: balance.mint,
      owner: balance.owner ?? null,
      decimals: balance.uiTokenAmount.decimals,
    });
  }

  const transfers: TokenTransfer[] = [];
  for (const instruction of instructions) {
    if (instruction.programId !== TOKEN_PROGRAM && instruction.programId !== TOKEN_2022_PROGRAM) continue;
    const parsed = instruction.parsed;
    if (!parsed?.type?.startsWith("transfer") || !parsed.info) continue;
    const info = parsed.info;
    const source = stringAt(info["source"]);
    const destination = stringAt(info["destination"]);
    if (!source || !destination) continue;
    const tokenAmountValue = info["tokenAmount"];
    const tokenAmount = isRecord(tokenAmountValue) ? tokenAmountValue : undefined;
    const amount = stringAt(tokenAmount?.["amount"] ?? info["amount"]);
    if (!amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) continue;
    const sourceMeta = accounts.get(source);
    const destinationMeta = accounts.get(destination);
    const mint = stringAt(info["mint"]) ?? sourceMeta?.mint ?? destinationMeta?.mint;
    const decimalsValue = tokenAmount?.["decimals"];
    const decimals =
      typeof decimalsValue === "number" ? decimalsValue : (sourceMeta?.decimals ?? destinationMeta?.decimals);
    if (!mint || decimals === undefined) continue;
    transfers.push({
      programId: instruction.programId,
      source,
      destination,
      authority: stringAt(info["authority"]),
      sourceOwner: sourceMeta?.owner ?? null,
      destinationOwner: destinationMeta?.owner ?? null,
      mint,
      rawAmount: BigInt(amount),
      decimals,
    });
  }
  return transfers;
}

/** `getMultipleAccounts` takes at most a hundred keys and refuses the call past that. */
const ACCOUNTS_BATCH = 100;

export interface SolanaRpcConfig {
  readonly rpcUrl: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** Most calls in one HTTP request. See `batchedRpc`. */
  readonly maxBatch?: number;
  /** Attempts for a request that failed as a whole. See `batchedRpc`. */
  readonly attempts?: number;
  /** Hold a batch open this long. The default is the current microtask. */
  readonly windowMs?: number;
}

/**
 * Solana JSON-RPC over plain `fetch`. No SDK: `@solana/kit` is not installed
 * until subsystem 3, where signing needs it, and everything read here is
 * already decoded by the node when asked for `jsonParsed`.
 */
export class SolanaRpc implements ChainReader, ChainHistory {
  private readonly now: () => number;
  /**
   * Every read goes through here, so calls issued together leave together and
   * a rate limit is retried once for the batch rather than separately by each
   * reader above. See `batch.ts` for what that is worth and what it costs.
   */
  private readonly call: <T>(method: string, params: readonly unknown[]) => Promise<T>;

  constructor(config: SolanaRpcConfig) {
    this.now = config.now ?? Date.now;
    this.call = batchedRpc({
      rpcUrl: config.rpcUrl,
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(config.maxBatch !== undefined ? { maxBatch: config.maxBatch } : {}),
      ...(config.attempts !== undefined ? { attempts: config.attempts } : {}),
      ...(config.windowMs !== undefined ? { windowMs: config.windowMs } : {}),
    });
  }

  /**
   * Both token programs, because xStocks are Token-2022 and USDC is classic SPL.
   *
   * `tokenAmount.amount` is the raw balance and is the only field read.
   * `uiAmount` is deliberately ignored: whether a node applies the
   * ScaledUiAmount multiplier to it depends on its version, so a portfolio
   * built on it would be right on one RPC provider and wrong on another. The
   * multiplier is applied once, by us, from `mintConfig`.
   */
  async tokenBalances(owner: string): Promise<readonly TokenBalance[]> {
    const pages = await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        this.call<{ value: readonly ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
          owner,
          { programId },
          { encoding: "jsonParsed" },
        ]),
      ),
    );

    const byMint = new Map<string, TokenBalance>();
    for (const page of pages) {
      for (const entry of page.value) {
        const info = entry.account.data.parsed.info;
        const raw = BigInt(info.tokenAmount.amount);
        if (raw === 0n) continue; // a closed position is not a holding
        const seen = byMint.get(info.mint);
        byMint.set(info.mint, {
          mint: info.mint,
          // A wallet may hold several accounts for one mint. They are one holding.
          rawAmount: (seen?.rawAmount ?? 0n) + raw,
          decimals: info.tokenAmount.decimals,
        });
      }
    }
    return [...byMint.values()];
  }

  async mintConfig(mint: string): Promise<MintConfig | null> {
    const result = await this.call<{ value: ParsedMint | null }>("getAccountInfo", [
      mint,
      { encoding: "jsonParsed" },
    ]);
    return this.toMintConfig(result.value);
  }

  /**
   * Every mint asked about, in calls of a hundred.
   *
   * `getMultipleAccounts` takes at most a hundred keys and refuses the call
   * past that, so the list is chunked. Answers come back by position, which is
   * why the chunk is kept beside its page rather than the mints re-derived.
   */
  async mintConfigs(mints: readonly string[]): Promise<ReadonlyMap<string, MintConfig>> {
    const chunks: string[][] = [];
    for (let i = 0; i < mints.length; i += ACCOUNTS_BATCH) {
      chunks.push(mints.slice(i, i + ACCOUNTS_BATCH));
    }
    const pages = await Promise.all(
      chunks.map((chunk) =>
        this.call<{ value: readonly (ParsedMint | null)[] }>("getMultipleAccounts", [
          chunk,
          { encoding: "jsonParsed" },
        ]),
      ),
    );

    const found = new Map<string, MintConfig>();
    chunks.forEach((chunk, page) => {
      chunk.forEach((mint, index) => {
        const config = this.toMintConfig(pages[page]?.value[index] ?? null);
        if (config !== null) found.set(mint, config);
      });
    });
    return found;
  }

  /** One parse, so a mint read on its own and one read in a batch cannot differ. */
  private toMintConfig(account: ParsedMint | null | undefined): MintConfig | null {
    const info = account?.data.parsed?.info;
    if (info === undefined || info.decimals === undefined) return null;

    const extensions = info.extensions ?? [];
    const scaled = extensions.find((e) => e.extension === "scaledUiAmountConfig")?.state;
    const pausable = extensions.find((e) => e.extension === "pausableConfig")?.state;

    return {
      decimals: info.decimals,
      multiplier: this.effectiveMultiplier(scaled),
      isPaused: pausable?.["paused"] === true,
    };
  }

  /**
   * A ScaledUiAmount mint carries the multiplier in force and the next one, with
   * the second taking over at a timestamp. Reading `multiplier` unconditionally
   * understates every share count from the moment a dividend goes effective —
   * measured at 0.08% on NVDAx two weeks after its September 2026 switchover.
   *
   * The values arrive as decimal strings, so they go into Decimal untouched. A
   * mint with no extension has a multiplier of one: one token, one share.
   */
  private effectiveMultiplier(state: Record<string, unknown> | undefined): Decimal {
    if (state === undefined) return ONE;
    const current = typeof state["multiplier"] === "string" ? D(state["multiplier"]) : ONE;
    const next = state["newMultiplier"];
    const at = state["newMultiplierEffectiveTimestamp"];
    if (typeof next !== "string" || typeof at !== "number") return current;
    return this.now() >= at * 1000 ? D(next) : current;
  }

  /**
   * The owner's token accounts for one mint, by address.
   *
   * A mint filter rather than a program filter: the mint implies its program,
   * so this is one call. It also finds a non-associated account, which deriving
   * the associated address would miss.
   */
  async tokenAccountsFor(owner: string, mint: string): Promise<readonly string[]> {
    const res = await this.call<{ value: readonly { pubkey: string }[] }>("getTokenAccountsByOwner", [
      owner,
      { mint },
      { encoding: "jsonParsed" },
    ]);
    return res.value.map((a) => a.pubkey);
  }

  async signatures(address: string, page: SignaturePage): Promise<readonly SignatureRef[]> {
    // Built by spread: `exactOptionalPropertyTypes` rejects an explicit
    // undefined, and the node treats a null `until` as a malformed request.
    const params = {
      limit: page.limit,
      ...(page.until === undefined ? {} : { until: page.until }),
      ...(page.before === undefined ? {} : { before: page.before }),
    };
    const res = await this.call<readonly RpcSignature[]>("getSignaturesForAddress", [address, params]);
    return res.map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      failed: s.err !== null && s.err !== undefined,
    }));
  }

  /**
   * Lamports arrive as JSON numbers and become bigint here, so nothing
   * downstream can do float arithmetic on money.
   */
  async transaction(signature: string): Promise<TransactionDetail | null> {
    const res = await this.call<RpcTransaction | null>("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: MAX_TX_VERSION },
    ]);
    // No such transaction, or the node has pruned it: a later node, or the
    // same one later, might answer differently. Worth retrying.
    if (res === null) return null;
    // The node has the transaction but not its metadata. Distinct from the
    // above, and not a retry candidate: the transaction exists and always
    // will, so this answer never changes. Stopping the walk here, as a
    // missing transaction does, would wedge that signature forever. With no
    // meta there is also no balance to read, so there is nothing to lose by
    // reporting it as an empty transaction and letting the walk advance.
    if (res.meta === null) {
      return {
        signature,
        blockTime: res.blockTime,
        succeeded: false,
        accountKeys: res.transaction.message.accountKeys.map((k) => k.pubkey),
        feeLamports: 0n,
        preLamports: [],
        postLamports: [],
        preTokens: [],
        postTokens: [],
        tokenTransfersIn: [],
      };
    }
    const meta = res.meta;
    const keys = res.transaction.message.accountKeys.map((k) => k.pubkey);
    const balances = [...(meta.preTokenBalances ?? []), ...(meta.postTokenBalances ?? [])];
    const instructions = [
      ...(res.transaction.message.instructions ?? []),
      ...(meta.innerInstructions ?? []).flatMap((group) => group.instructions),
    ];
    return {
      signature,
      blockTime: res.blockTime,
      succeeded: meta.err === null || meta.err === undefined,
      accountKeys: keys,
      feeLamports: BigInt(meta.fee),
      preLamports: meta.preBalances.map((n) => BigInt(n)),
      postLamports: meta.postBalances.map((n) => BigInt(n)),
      preTokens: (meta.preTokenBalances ?? []).map(toEntry),
      postTokens: (meta.postTokenBalances ?? []).map(toEntry),
      tokenTransfersIn: tokenTransfersIn(instructions, keys, balances),
    };
  }
}
