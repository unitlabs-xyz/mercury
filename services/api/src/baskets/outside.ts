import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { address as toAddress, isOffCurveAddress } from "@solana/kit";
import { D, type Decimal, ZERO } from "@mercury/core";
import type { ChainHistory, ChainReader, TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { basketAccounts, historyEvents, historyTxs, wallets } from "../db/schema.js";
import { movementOf } from "../history/events.js";

/**
 * The Swig smart-wallet program Glider runs every basket account on: a
 * basket's assets sit in a Swig sub-account, a program-derived address. One
 * list, so a second deployment is one line.
 */
export const SWIG_PROGRAMS: ReadonlySet<string> = new Set(["swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB"]);

/** The most accounts one look checks, and how far back each one's own history is read. */
const MAX_CANDIDATES = 12;
const SIGNATURES_PER_CANDIDATE = 5;

/** A basket made outside Mercury, as far as the chain shows it: where it is, and what it holds. */
export interface OutsideBasket {
  /** The basket account: the Swig sub-account the person funded. */
  readonly address: string;
  readonly valueUsd: Decimal;
  readonly holdings: readonly {
    readonly mint: string;
    readonly symbol: string;
    readonly ticker: string | null;
    readonly amount: Decimal;
    readonly valueUsd: Decimal;
  }[];
}

/** A token Mercury lists, by mint: what a basket's holding is called. */
export interface Listed {
  readonly symbol: string;
  readonly ticker: string | null;
}

export interface OutsideDeps {
  readonly db: Db;
  readonly history: Pick<ChainHistory, "signatures" | "transaction">;
  readonly chain: Pick<ChainReader, "tokenBalances">;
  readonly prices: PriceBoard;
  readonly listed: () => Promise<ReadonlyMap<string, Listed>>;
}

/** A transaction as the history reader kept it: its big numbers as strings. */
const fromRaw = (raw: unknown): TransactionDetail | null => {
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

/**
 * Where a linked wallet has sent tokens: the accounts that could be a basket
 * it funded outside Mercury. Read from the history reader's departures, which
 * name who received them; a departure read before that was recorded is worked
 * out again from the transaction it kept. The person's own wallets, and the
 * baskets Mercury already runs for them, are left out.
 */
export async function outsideCandidates(
  db: Db,
  wallet: { readonly userId: string; readonly walletId: string; readonly address: string },
): Promise<readonly string[]> {
  const named = await db
    .selectDistinct({ to: historyEvents.destinationOwner })
    .from(historyEvents)
    .where(
      and(
        eq(historyEvents.walletId, wallet.walletId),
        eq(historyEvents.kind, "out"),
        isNotNull(historyEvents.destinationOwner),
      ),
    );
  const unnamed = await db
    .select({ raw: historyTxs.raw, mint: historyEvents.mint })
    .from(historyEvents)
    .innerJoin(historyTxs, eq(historyTxs.signature, historyEvents.signature))
    .where(
      and(
        eq(historyEvents.walletId, wallet.walletId),
        eq(historyEvents.kind, "out"),
        isNull(historyEvents.destinationOwner),
      ),
    );
  const found = new Set(named.flatMap((r) => (r.to === null ? [] : [r.to])));
  for (const r of unnamed) {
    const tx = fromRaw(r.raw);
    const to =
      tx === null || r.mint === null ? null : movementOf(tx, wallet.address, r.mint)?.destinationOwner;
    if (to) found.add(to);
  }
  if (found.size === 0) return [];

  const [own, known] = await Promise.all([
    db.select({ address: wallets.address }).from(wallets).where(eq(wallets.userId, wallet.userId)),
    db
      .select({ address: basketAccounts.address })
      .from(basketAccounts)
      .where(and(eq(basketAccounts.userId, wallet.userId), inArray(basketAccounts.address, [...found]))),
  ]);
  for (const w of [...own, ...known]) found.delete(w.address);
  return [...found];
}

const offCurve = (candidate: string): boolean => {
  try {
    return isOffCurveAddress(toAddress(candidate));
  } catch {
    return false;
  }
};

/**
 * Whether an account is a Swig-run basket account: not a person's wallet (a
 * program-derived address, off the curve), and run by the Swig program, as
 * its own recent transactions show. Anything less is not called a basket:
 * calling a friend's wallet "your basket" would be worse than missing one.
 */
async function isSwigAccount(history: OutsideDeps["history"], candidate: string): Promise<boolean> {
  if (!offCurve(candidate)) return false;
  const recent = await history.signatures(candidate, { limit: SIGNATURES_PER_CANDIDATE });
  for (const ref of recent) {
    if (ref.failed) continue;
    const tx = await history.transaction(ref.signature);
    if (tx?.accountKeys.some((key) => SWIG_PROGRAMS.has(key))) return true;
  }
  return false;
}

/**
 * The baskets a linked wallet runs outside Mercury, found on the chain, with
 * what each holds now at Mercury's prices. Mercury can't see them through
 * Glider (a basket belongs to the app that made it) or move them (the owner's
 * key alone can't take a sub-account's funds), so this is what lets the page
 * show them and walk the person through bringing them in.
 *
 * Only accounts holding something Mercury lists are returned: an emptied one
 * has nothing to bring in.
 */
export async function findOutsideBaskets(
  deps: OutsideDeps,
  wallet: { readonly userId: string; readonly walletId: string; readonly address: string },
): Promise<readonly OutsideBasket[]> {
  const candidates = (await outsideCandidates(deps.db, wallet)).slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return [];
  const listed = await deps.listed();
  const baskets: OutsideBasket[] = [];
  for (const candidate of candidates) {
    if (!(await isSwigAccount(deps.history, candidate))) continue;
    const balances = (await deps.chain.tokenBalances(candidate)).filter(
      (b) => b.rawAmount > 0n && listed.has(b.mint),
    );
    if (balances.length === 0) continue;
    const prices = await deps.prices.pricesFor(balances.map((b) => b.mint));
    const holdings = balances.map((b) => {
      const about = listed.get(b.mint)!;
      const amount = D(b.rawAmount.toString()).div(D(10).pow(b.decimals));
      const price = prices.get(b.mint)?.usdPricePerToken ?? ZERO;
      return {
        mint: b.mint,
        symbol: about.symbol,
        ticker: about.ticker,
        amount,
        valueUsd: amount.mul(price),
      };
    });
    baskets.push({
      address: candidate,
      valueUsd: holdings.reduce((s, h) => s.add(h.valueUsd), ZERO),
      holdings: holdings.sort((a, b) => b.valueUsd.comparedTo(a.valueUsd)),
    });
  }
  return baskets;
}
