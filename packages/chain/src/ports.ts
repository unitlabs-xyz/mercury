import type { Candidate, Decimal, Issuer, Side } from "@mercury/core";

/**
 * The boundaries between our domain logic and the outside world.
 *
 * Every one of these has a fixture implementation, so the API runs end to end with no
 * keys and no network. That is what lets the web app be built on day one.
 */

export interface TokenRef {
  readonly mint: string;
  readonly symbol: string;
  readonly ticker: string;
  readonly issuer: Issuer;
  readonly decimals: number;
}

export interface TokenRegistry {
  /** Every wrapper we know of for a ticker, across issuers. */
  wrappersFor(ticker: string): Promise<readonly TokenRef[]>;
  all(): Promise<readonly TokenRef[]>;
  byMint(mint: string): Promise<TokenRef | null>;
}

export interface QuoteRequest {
  readonly side: Side;
  readonly mint: string;
  readonly decimals: number;
  /** USD for a buy, tokens for a sell. */
  readonly amount: Decimal;
  readonly slippageBps?: number;
}

/**
 * ADR 0008 chose the aggregator's own execution path so that landing was not
 * our problem. That ended when Ultra was removed and pricing and building
 * became one keyless endpoint; submitting and confirming have been ours since.
 *
 * `buildSwapInstructions` takes the next step the ADR left open, and only for
 * the case that needs it: a sponsored buy has to carry the buyer's repayment
 * in the same transaction as the swap.
 */
export interface QuoteSource {
  quote(req: QuoteRequest): Promise<Candidate["quote"]>;
  /**
   * Base64 unsigned transactions for the caller to sign.
   *
   * Takes the quote itself rather than an identifier for it. An id has to be
   * redeemable somewhere, and the only place that held one was a second
   * provider with a second set of prices — so the order was priced against one
   * quote and filled against another. Passing the quote back to the adapter
   * that produced it keeps the two the same object.
   */
  buildSwap(quote: RedeemableQuote, owner: string): Promise<readonly string[]>;
  /**
   * The same swap, in pieces, so a caller can put something beside it.
   *
   * `payer` moves the fee and any rent onto another account, which is what
   * lets a buyer hold no SOL at all. They still sign; they just do not pay.
   */
  buildSwapInstructions(quote: RedeemableQuote, owner: string, payer: string): Promise<SwapInstructions>;
}

/** One instruction as the aggregator serialises it. */
export interface WireInstruction {
  readonly programId: string;
  readonly accounts: readonly {
    readonly pubkey: string;
    readonly isSigner: boolean;
    readonly isWritable: boolean;
  }[];
  /** Base64. */
  readonly data: string;
}

export interface SwapInstructions {
  readonly computeBudget: readonly WireInstruction[];
  readonly setup: readonly WireInstruction[];
  readonly swap: WireInstruction;
  readonly cleanup: WireInstruction | null;
  /** Without these a real route will not fit in a transaction. */
  readonly lookupTables: readonly string[];
}

/**
 * What it takes to turn a quote back into a transaction: the provider's own
 * payload, plus the id it is known by so a failure can name it. `Quote` and
 * `PricedCandidate` both carry these, which is how a quote survives the trip
 * from pricing to signing without being re-fetched.
 */
export interface RedeemableQuote {
  readonly quoteId: string | null;
  readonly raw: unknown;
}

export interface TriggerOrder {
  readonly account: string;
  readonly status: "open" | "filled" | "partial" | "expired" | "cancelled";
  readonly filledTokens: Decimal;
}

export interface TriggerSource {
  create(req: QuoteRequest & { triggerPricePerToken: Decimal; owner: string }): Promise<readonly string[]>;
  status(account: string): Promise<TriggerOrder>;
  cancel(account: string, owner: string): Promise<readonly string[]>;
}

/** What the stock sync needs and `TokenRegistry` deliberately does not carry. */
export interface ListedWrapper {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  /** The issuer's own name, e.g. "NVIDIA xStock". Our display name is editorial. */
  readonly name: string;
  readonly icon: string | null;
  readonly liquidityUsd: Decimal;
  readonly holders: number;
  /** Buyers minus sellers over 24h, from Jupiter's own stats. Never negative here. */
  readonly netBuyers24h: number;
  readonly volume24hUsd: Decimal;
  readonly traders24h: number;
  /** Jupiter prices it at all. False means no pool: nothing to quote, nothing to show. */
  readonly hasMarket: boolean;
}

export interface ListedInstrument {
  readonly ticker: string;
  readonly wrappers: readonly ListedWrapper[];
}

/**
 * The live token universe, richer than `TokenRegistry` and used only to fill the
 * `instrument` and `token` tables. Kept separate so the decision path keeps
 * depending on the four fields it actually needs.
 */
export interface SupportedStocks {
  instruments(): Promise<readonly ListedInstrument[]>;
}

/** One token account's worth, in the mint's smallest unit. Never a float. */
export interface TokenBalance {
  readonly mint: string;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

export interface MintConfig {
  readonly decimals: number;
  /**
   * The multiplier in force right now, which is `newMultiplier` once its
   * effective timestamp has passed. One token is this many shares.
   */
  readonly multiplier: Decimal;
  /** Token-2022 Pausable. True when the issuer has halted the token. */
  readonly isPaused: boolean;
}

/**
 * How settled a reading has to be. `confirmed` can still be dropped;
 * `finalized` trails it by around thirteen seconds and cannot.
 *
 * Reads default to `confirmed`: sending already answers at that point, so a
 * balance still denying it is wrong on screen. Jobs that persist what they
 * read ask for `finalized`, because a dropped block would leave behind a lot,
 * a snapshot or a margin warning for something that never happened.
 */
export type Commitment = "confirmed" | "finalized";

/**
 * What we read from Solana without ever holding a key. Two calls, both public:
 * a wallet's token accounts, and a mint's Token-2022 extensions.
 */
export interface ChainReader {
  tokenBalances(owner: string, commitment?: Commitment): Promise<readonly TokenBalance[]>;
  /** Null when the account does not exist or is not a Token-2022 mint. */
  mintConfig(mint: string): Promise<MintConfig | null>;
  /**
   * Optional. Many mints as one call rather than one call each.
   *
   * `batchedRpc` already puts calls issued together into one HTTP request, so
   * this is not about round trips — it is about what the node is asked to do.
   * A hundred `getAccountInfo` calls are a hundred billed method calls however
   * few requests carry them; one `getMultipleAccounts` is one. A mint absent
   * from the map is one the node had no account for.
   *
   * Optional because it is a capability, not a contract: a reader that cannot
   * do it leaves it out and callers fall back to `mintConfig`.
   */
  mintConfigs?(mints: readonly string[]): Promise<ReadonlyMap<string, MintConfig>>;
}

/** One signature from an address's history. */
export interface SignatureRef {
  readonly signature: string;
  readonly slot: number;
  /** Seconds since the epoch. Null on a block the node has not timestamped. */
  readonly blockTime: number | null;
  /** A failed transaction moved nothing, and is skipped rather than read. */
  readonly failed: boolean;
}

export interface SignaturePage {
  readonly limit: number;
  /** Stop once this signature is reached. */
  readonly until?: string;
  /** Start below this signature. How the walk pages back through a busy window. */
  readonly before?: string;
}

/** One token account's balance on one side of a transaction. */
export interface TokenBalanceEntry {
  readonly mint: string;
  /** The wallet that owns the token account, not the account address. */
  readonly owner: string | null;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

/** One parsed SPL or Token-2022 transfer, including CPI inner instructions. */
export interface TokenTransfer {
  readonly programId: string;
  readonly source: string;
  readonly destination: string;
  readonly authority: string | null;
  readonly sourceOwner: string | null;
  readonly destinationOwner: string | null;
  readonly mint: string;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

export interface TransactionDetail {
  readonly signature: string;
  readonly blockTime: number | null;
  /**
   * False when the transaction failed on chain, and also when the node kept the
   * transaction but not its metadata — in that case nothing can be confirmed
   * about it, and "we could not confirm this worked" is the safe reading for a
   * caller about to write money into the books.
   */
  readonly succeeded: boolean;
  /** Account keys in index order; under jsonParsed this includes lookup-table entries. */
  readonly accountKeys: readonly string[];
  readonly feeLamports: bigint;
  readonly preLamports: readonly bigint[];
  readonly postLamports: readonly bigint[];
  readonly preTokens: readonly TokenBalanceEntry[];
  readonly postTokens: readonly TokenBalanceEntry[];
  /** Present on live RPC reads; optional keeps recorded fixtures source-compatible. */
  readonly tokenTransfersIn?: readonly TokenTransfer[];
}

/**
 * What happened to an address, as opposed to what it holds.
 *
 * A separate port from `ChainReader` rather than three more methods on it:
 * `withPledged` implements `ChainReader` as an object literal to fold in stock
 * pledged to Kamino, and a wrapper about holdings has no business answering
 * questions about signatures.
 */
export interface ChainHistory {
  /** The owner's token accounts for one mint. Empty when they have none yet. */
  tokenAccountsFor(owner: string, mint: string): Promise<readonly string[]>;
  /** Newest first, as the node returns them. */
  signatures(address: string, page: SignaturePage): Promise<readonly SignatureRef[]>;
  /** Null when the node has no such transaction, or has pruned it. */
  transaction(signature: string): Promise<TransactionDetail | null>;
}
