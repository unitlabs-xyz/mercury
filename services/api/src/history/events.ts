import type { TokenBalanceEntry, TransactionDetail } from "@mercury/chain";

/** Wrapped SOL's mint: what the reader writes when SOL left the wallet in a swap. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * What one transaction did to one of a wallet's tokens: the amounts only.
 *
 * The reader does not decode swap routes. Every transaction says each token
 * balance before and after it, and that is all the amounts it needs: what
 * came in or went out of this token, what else left the wallet in the same
 * transaction (so the cost pass can tell a swap from a transfer), and for a
 * transfer in, who sent it.
 */
export interface Movement {
  readonly kind: "in" | "out";
  /** Of this token, always positive. */
  readonly amountRaw: bigint;
  /** For an arrival: the token that left the wallet most in the same transaction, if any did. */
  readonly counterMint: string | null;
  readonly counterAmountRaw: bigint | null;
  /** For an arrival: the wallet that sent it, where the transaction says. */
  readonly sourceOwner: string | null;
  /**
   * For a departure: the wallet that received it, where the transaction says
   * and it was a plain transfer. A swap's tokens go to a pool, not a person.
   */
  readonly destinationOwner: string | null;
}

/**
 * A wallet's balance of one token at one side of a transaction.
 *
 * Summed over every account the wallet owns for that mint: a token balance
 * entry names its owner and mint, not its account, and a wallet holds one
 * account per mint in all but rare cases.
 */
export const balanceOf = (entries: readonly TokenBalanceEntry[], owner: string, mint: string): bigint =>
  entries.reduce((sum, e) => (e.owner === owner && e.mint === mint ? sum + e.rawAmount : sum), 0n);

/** Every mint the owner's balance changed in, as after minus before. */
const deltas = (tx: TransactionDetail, owner: string): Map<string, bigint> => {
  const out = new Map<string, bigint>();
  const mints = new Set(
    [...tx.preTokens, ...tx.postTokens].filter((e) => e.owner === owner).map((e) => e.mint),
  );
  for (const mint of mints) {
    const d = balanceOf(tx.postTokens, owner, mint) - balanceOf(tx.preTokens, owner, mint);
    if (d !== 0n) out.set(mint, d);
  }
  return out;
};

/**
 * SOL that left the wallet, beyond the network fee it paid: a swap paid in
 * SOL. Zero when it gained SOL or only paid the fee. The fee is the payer's,
 * and the payer is the first account; a relayer paying it leaves the wallet
 * untouched.
 */
const solSpent = (tx: TransactionDetail, owner: string): bigint => {
  const i = tx.accountKeys.indexOf(owner);
  if (i < 0) return 0n;
  const before = tx.preLamports[i] ?? 0n;
  const after = tx.postLamports[i] ?? 0n;
  const fee = i === 0 ? tx.feeLamports : 0n;
  const spent = before - after - fee;
  return spent > 0n ? spent : 0n;
};

/** Who sent `mint` to `owner`, from the parsed transfers, else from whose balance of it fell. */
const senderOf = (tx: TransactionDetail, owner: string, mint: string): string | null => {
  const transfer = (tx.tokenTransfersIn ?? []).find(
    (t) =>
      t.mint === mint && t.destinationOwner === owner && t.sourceOwner !== null && t.sourceOwner !== owner,
  );
  if (transfer?.sourceOwner) return transfer.sourceOwner;
  const fell = tx.preTokens.find(
    (e) =>
      e.mint === mint &&
      e.owner !== null &&
      e.owner !== owner &&
      balanceOf(tx.postTokens, e.owner, mint) < balanceOf(tx.preTokens, e.owner, mint),
  );
  return fell?.owner ?? null;
};

/** Who received `mint` from `owner`, from the parsed transfers, else from whose balance of it rose. */
const receiverOf = (tx: TransactionDetail, owner: string, mint: string): string | null => {
  const transfer = (tx.tokenTransfersIn ?? []).find(
    (t) =>
      t.mint === mint &&
      t.sourceOwner === owner &&
      t.destinationOwner !== null &&
      t.destinationOwner !== owner,
  );
  if (transfer?.destinationOwner) return transfer.destinationOwner;
  const rose = tx.postTokens.find(
    (e) =>
      e.mint === mint &&
      e.owner !== null &&
      e.owner !== owner &&
      balanceOf(tx.postTokens, e.owner, mint) > balanceOf(tx.preTokens, e.owner, mint),
  );
  return rose?.owner ?? null;
};

/**
 * What a transaction did to `owner`'s `mint`, or null when it did nothing to
 * it (or failed, and so moved nothing).
 */
export const movementOf = (tx: TransactionDetail, owner: string, mint: string): Movement | null => {
  if (!tx.succeeded) return null;
  const all = deltas(tx, owner);
  const d = all.get(mint) ?? 0n;
  if (d === 0n) return null;
  if (d < 0n) {
    // A plain transfer only: something arriving in the same transaction makes it a swap.
    const swapped = [...all].some(([m, delta]) => m !== mint && delta > 0n);
    return {
      kind: "out",
      amountRaw: -d,
      counterMint: null,
      counterAmountRaw: null,
      sourceOwner: null,
      destinationOwner: swapped ? null : receiverOf(tx, owner, mint),
    };
  }

  // What left the wallet in the same transaction: the largest other token out, else SOL beyond the fee.
  let counterMint: string | null = null;
  let counterAmountRaw: bigint | null = null;
  for (const [m, delta] of all) {
    if (m === mint || delta >= 0n) continue;
    if (counterAmountRaw === null || -delta > counterAmountRaw) {
      counterMint = m;
      counterAmountRaw = -delta;
    }
  }
  if (counterMint === null) {
    const sol = solSpent(tx, owner);
    if (sol > 0n) {
      counterMint = SOL_MINT;
      counterAmountRaw = sol;
    }
  }
  return {
    kind: "in",
    amountRaw: d,
    counterMint,
    counterAmountRaw,
    // A swap's tokens come from a pool, not a person: only a plain transfer names its sender.
    sourceOwner: counterMint === null ? senderOf(tx, owner, mint) : null,
    destinationOwner: null,
  };
};

/**
 * Whether the wallet held none of `mint` just before this transaction. Read
 * newest first, this is where the walk back can stop: nothing older can
 * change what today's shares cost, because everything bought before it had
 * already left.
 */
export const emptyBefore = (tx: TransactionDetail, owner: string, mint: string): boolean =>
  balanceOf(tx.preTokens, owner, mint) === 0n;

/** The transaction as JSON, kept raw for a better rule later: bigints become strings. */
export const rawJson = (tx: TransactionDetail): unknown =>
  JSON.parse(JSON.stringify(tx, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)));

/** A transaction as `rawJson` kept it, read back: its big numbers were kept as strings. */
export const transactionFromRaw = (raw: unknown): TransactionDetail | null => {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const entries = (v: unknown): TokenBalanceEntry[] =>
    Array.isArray(v)
      ? v.map((e: Record<string, unknown>) => ({
          mint: String(e["mint"]),
          owner: e["owner"] === null || e["owner"] === undefined ? null : String(e["owner"]),
          rawAmount: BigInt(String(e["rawAmount"] ?? "0")),
          decimals: Number(e["decimals"] ?? 0),
        }))
      : [];
  const transfers = Array.isArray(r["tokenTransfersIn"])
    ? (r["tokenTransfersIn"] as Record<string, unknown>[]).map((t) => ({
        programId: String(t["programId"] ?? ""),
        source: String(t["source"] ?? ""),
        destination: String(t["destination"] ?? ""),
        authority: t["authority"] === null ? null : String(t["authority"] ?? ""),
        sourceOwner: t["sourceOwner"] === null ? null : String(t["sourceOwner"] ?? ""),
        destinationOwner: t["destinationOwner"] === null ? null : String(t["destinationOwner"] ?? ""),
        mint: String(t["mint"] ?? ""),
        rawAmount: BigInt(String(t["rawAmount"] ?? "0")),
        decimals: Number(t["decimals"] ?? 0),
      }))
    : [];
  return {
    signature: String(r["signature"] ?? ""),
    blockTime: typeof r["blockTime"] === "number" ? r["blockTime"] : null,
    succeeded: r["succeeded"] === true,
    accountKeys: Array.isArray(r["accountKeys"]) ? r["accountKeys"].map(String) : [],
    feeLamports: 0n,
    preLamports: [],
    postLamports: [],
    preTokens: entries(r["preTokens"]),
    postTokens: entries(r["postTokens"]),
    tokenTransfersIn: transfers,
  };
};
