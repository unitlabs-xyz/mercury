import type { TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import { DOLLAR_MINTS } from "./cost-plan.js";

/** Wrapped SOL's mint: what the reader writes when SOL left the wallet in a swap. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Kamino's lending program: a token it moves in or out of the wallet is collateral, not a trade. */
export const KAMINO_LENDING_PROGRAM = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
/**
 * The xStocks market's authority at Kamino: the owner of the reserve accounts
 * a pledge moves the stock into, and a withdrawal moves it out of. Derived
 * from the market (`lendingMarketAuthPda`, seeds "lma" and the market) and
 * checked on mainnet on 25 November 2026: a deposit's stock and its
 * collateral tokens both land in accounts this owns. A change in its balance
 * of a stock is what was pledged or taken back, whatever the wallet's balance did.
 */
export const KAMINO_XSTOCKS_AUTHORITY = "2Z7zhqp1eddmHNmEqexftST6DFPWmoL4QqfgiG5uJMJx";
/** Kamino's vaults (Earn). A vault calls the lending program too, so its share tokens are told apart by this. */
export const KAMINO_VAULT_PROGRAM = "KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd";

/**
 * Whether this transaction pledged or withdrew collateral at Kamino: the
 * lending program took part, and no Earn vault did. Pledged shares are still
 * the person's, so the cost pass keeps them, at their cost, and a withdrawal
 * brings back what was already held rather than a new arrival.
 *
 * Read from the transaction itself rather than from Kamino's own list of the
 * loan's history, so the reader can tell as it walks back, and a loan worked
 * in another app is read the same way as one worked in Mercury.
 */
export const isCollateralMove = (tx: TransactionDetail): boolean =>
  tx.accountKeys.includes(KAMINO_LENDING_PROGRAM) && !tx.accountKeys.includes(KAMINO_VAULT_PROGRAM);

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
  /**
   * "in" and "out" are arrivals and departures. "loan_deposit" and
   * "loan_withdraw" are collateral pledged to Kamino and taken back: the
   * shares left the wallet's account but not the person, so they are held
   * all along, at the cost they had.
   */
  readonly kind: "in" | "out" | "loan_deposit" | "loan_withdraw";
  /** Of this token, always positive. */
  readonly amountRaw: bigint;
  /**
   * The other side of a swap. For an arrival, the token that left the wallet
   * most in the same transaction (what it was paid with); for a departure, the
   * token that arrived most (what it was sold for). Null for a plain transfer.
   */
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
  // Rent for accounts this transaction opened (the token account the shares landed in) is not a price.
  const spent = before - after - fee - rentOpened(tx, i);
  // Below this it is a tip or dust, not what shares were bought with: the arrival is priced as one from outside.
  return spent >= MIN_SOL_PAYMENT ? spent : 0n;
};

/**
 * The least SOL that reads as paying for shares: 0.01 SOL, about a dollar
 * and a half. Below it, what the wallet spent beyond the fee and any rent is
 * a priority tip or dust, and dividing it by the shares gave a cost of cents.
 */
export const MIN_SOL_PAYMENT = 10_000_000n;

/** Lamports put into accounts that had none before this transaction: their rent, paid by whoever opened them. */
const rentOpened = (tx: TransactionDetail, owner: number): bigint => {
  let rent = 0n;
  tx.accountKeys.forEach((_, j) => {
    if (j === owner) return;
    const pre = tx.preLamports[j] ?? 0n;
    const post = tx.postLamports[j] ?? 0n;
    if (pre === 0n && post > 0n) rent += post;
  });
  return rent;
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
 * What a transaction did to `owner`'s `mint`, as one movement or several, and
 * none when it did nothing to it (or failed, and so moved nothing).
 *
 * At Kamino, what was pledged or taken back is read from the market's own
 * account (`KAMINO_XSTOCKS_AUTHORITY`), not from the wallet's: a buy and a
 * pledge in one transaction leaves the wallet's balance where it was, and was
 * read as nothing, so the shares bought had no cost. The pledge is one
 * movement, and whatever the wallet gained or lost beyond it is an arrival or
 * a departure like any other (bought with the dollars that left; sold, as in
 * a repay with collateral). Where the market's account is not among the
 * balances, the wallet's own change is the pledge, as before.
 */
export const movementsOf = (tx: TransactionDetail, owner: string, mint: string): readonly Movement[] => {
  if (!tx.succeeded) return [];
  const all = deltas(tx, owner);
  const d = all.get(mint) ?? 0n;
  if (isCollateralMove(tx)) {
    const pledged =
      balanceOf(tx.postTokens, KAMINO_XSTOCKS_AUTHORITY, mint) -
      balanceOf(tx.preTokens, KAMINO_XSTOCKS_AUTHORITY, mint);
    if (pledged === 0n) return d === 0n ? [] : [collateral(d < 0n ? "loan_deposit" : "loan_withdraw", d)];
    const pledge = collateral(pledged > 0n ? "loan_deposit" : "loan_withdraw", pledged);
    // What the wallet gained or lost beyond what went into or came out of the loan.
    const rest = d + pledged;
    if (rest > 0n) return [pledge, arrival(tx, owner, mint, all, rest)];
    if (rest < 0n) return [pledge, departure(tx, owner, mint, all, -rest)];
    return [pledge];
  }
  if (d === 0n) return [];
  return [d > 0n ? arrival(tx, owner, mint, all, d) : departure(tx, owner, mint, all, -d)];
};

/**
 * The one movement a transaction made in `mint`, or its trade where it made
 * a pledge and a trade together: for a reader that wants one (who received a
 * departure, say). See `movementsOf`.
 */
export const movementOf = (tx: TransactionDetail, owner: string, mint: string): Movement | null => {
  const all = movementsOf(tx, owner, mint);
  return all.find((m) => m.kind === "in" || m.kind === "out") ?? all[0] ?? null;
};

const collateral = (kind: "loan_deposit" | "loan_withdraw", amount: bigint): Movement => ({
  kind,
  amountRaw: amount < 0n ? -amount : amount,
  counterMint: null,
  counterAmountRaw: null,
  sourceOwner: null,
  destinationOwner: null,
});

/**
 * The other side of a trade, among the wallet's other tokens that moved the
 * given way: dollars first (USDC or USDT, which say the price exactly),
 * else the largest amount. Raw amounts of different tokens are not values,
 * so dollars are never passed over for a token whose units are smaller.
 */
const counterOf = (
  all: ReadonlyMap<string, bigint>,
  mint: string,
  way: "in" | "out",
): { mint: string; raw: bigint } | null => {
  let best: { mint: string; raw: bigint } | null = null;
  for (const [m, delta] of all) {
    if (m === mint) continue;
    const raw = way === "out" ? -delta : delta;
    if (raw <= 0n) continue;
    const dollars = DOLLAR_MINTS.has(m);
    const bestDollars = best !== null && DOLLAR_MINTS.has(best.mint);
    if (best === null || (dollars && !bestDollars) || (dollars === bestDollars && raw > best.raw)) {
      best = { mint: m, raw };
    }
  }
  return best;
};

const departure = (
  tx: TransactionDetail,
  owner: string,
  mint: string,
  all: ReadonlyMap<string, bigint>,
  amount: bigint,
): Movement => {
  // A plain transfer only: something arriving in the same transaction makes it a swap, sold for it.
  const soldFor = counterOf(all, mint, "in");
  return {
    kind: "out",
    amountRaw: amount,
    counterMint: soldFor?.mint ?? null,
    counterAmountRaw: soldFor?.raw ?? null,
    sourceOwner: null,
    destinationOwner: soldFor === null ? receiverOf(tx, owner, mint) : null,
  };
};

const arrival = (
  tx: TransactionDetail,
  owner: string,
  mint: string,
  all: ReadonlyMap<string, bigint>,
  amount: bigint,
): Movement => {
  // What left the wallet in the same transaction: dollars, else the largest other token out, else SOL beyond the fee.
  const paid = counterOf(all, mint, "out");
  let counterMint = paid?.mint ?? null;
  let counterAmountRaw = paid?.raw ?? null;
  if (counterMint === null) {
    const sol = solSpent(tx, owner);
    if (sol > 0n) {
      counterMint = SOL_MINT;
      counterAmountRaw = sol;
    }
  }
  return {
    kind: "in",
    amountRaw: amount,
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
  // Kept as strings by `rawJson`; a swap paid in SOL is read from these.
  const lamports = (v: unknown): bigint[] => (Array.isArray(v) ? v.map((x) => BigInt(String(x))) : []);
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
    feeLamports: BigInt(String(r["feeLamports"] ?? "0")),
    preLamports: lamports(r["preLamports"]),
    postLamports: lamports(r["postLamports"]),
    preTokens: entries(r["preTokens"]),
    postTokens: entries(r["postTokens"]),
    tokenTransfersIn: transfers,
  };
};
