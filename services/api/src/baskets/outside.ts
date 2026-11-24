import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { address as toAddress, isOffCurveAddress } from "@solana/kit";
import { D, Decimal, ZERO } from "@mercury/core";
import type { ChainHistory, ChainReader, TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { basketAccounts, historyEvents, historyTxs, wallets } from "../db/schema.js";
import { movementOf } from "../history/events.js";

/**
 * The Swig smart-wallet program Glider runs every basket account on: a
 * basket's assets sit in a Swig sub-account, a program-derived address. One
 * list, so a second deployment is one line.
 *
 * Checked on mainnet 24 November 2026 against a real Glider basket account
 * (`7H3xg82jB7ctTqcN88TUxFBhVTSjPkALiqFe9FiXfWCk`, a Mercury enrolment): off
 * the curve, and every transaction past its funding goes through this
 * program, including Jupiter swaps of TSLAx and NVDAx in its rebalance.
 */
export const SWIG_PROGRAMS: ReadonlySet<string> = new Set(["swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB"]);

/** The most accounts one look checks, and how far back each one's own history is read. */
const MAX_CANDIDATES = 12;
const SIGNATURES_PER_CANDIDATE = 5;

/** An amount of one token Mercury lists, named and valued. */
export interface Holding {
  readonly mint: string;
  readonly symbol: string;
  readonly ticker: string | null;
  readonly amount: Decimal;
  readonly valueUsd: Decimal;
}

/** A Mercury basket, as far as finding the closest one to another basket goes. */
export interface Template {
  readonly slug: string;
  readonly name: string;
  readonly allocations: readonly {
    readonly ticker: string;
    readonly assetId: string;
    readonly weightBps: number;
  }[];
}

/** A basket made outside Mercury, as far as the chain shows it: where it is, and what it holds. */
export interface OutsideBasket {
  /** The basket account: the Swig sub-account the person funded. */
  readonly address: string;
  readonly valueUsd: Decimal;
  /** What it holds now. Empty once it has been withdrawn. */
  readonly holdings: readonly Holding[];
  /**
   * What came from it into the linked wallet in the last two weeks: the
   * withdrawal, landed. Shares or USDC, so the page can say what to do next.
   * Null when nothing has.
   */
  readonly arrived: { readonly at: Date; readonly holdings: readonly Holding[] } | null;
  /** The Mercury basket that holds most of the same, to invest in here instead. Null when none overlaps. */
  readonly similar: { readonly slug: string; readonly name: string; readonly overlap: Decimal } | null;
}

/** A token Mercury lists, by mint: what a basket's holding is called. */
export interface Listed {
  readonly symbol: string;
  readonly ticker: string | null;
  readonly decimals: number;
}

/** How far back a withdrawal from the basket still counts as having just landed. */
export const ARRIVED_WITHIN_MS = 14 * 24 * 60 * 60_000;

export interface OutsideDeps {
  readonly db: Db;
  readonly history: Pick<ChainHistory, "signatures" | "transaction">;
  readonly chain: Pick<ChainReader, "tokenBalances">;
  readonly prices: PriceBoard;
  readonly listed: () => Promise<ReadonlyMap<string, Listed>>;
  /** Mercury's baskets, to suggest the closest. Absent, none is suggested. */
  readonly templates?: () => Promise<readonly Template[]>;
  readonly now?: () => Date;
}

/**
 * The Mercury basket closest to what a basket holds: the share of its value
 * in assets a Mercury basket also holds, each counted up to that basket's own
 * weight in it. Cash is left out of both sides: it says nothing about the
 * strategy. Null when no Mercury basket holds any of it.
 */
export const closestBasket = (
  holdings: readonly Holding[],
  templates: readonly Template[],
): OutsideBasket["similar"] => {
  const stocks = holdings.filter((h) => h.ticker !== null && h.valueUsd.gt(0));
  const total = stocks.reduce((s, h) => s.add(h.valueUsd), ZERO);
  if (!total.gt(0)) return null;
  let best: OutsideBasket["similar"] = null;
  for (const t of templates) {
    let overlap = ZERO;
    for (const h of stocks) {
      const a = t.allocations.find((x) => x.assetId.endsWith(`:${h.mint}`) || x.ticker === h.ticker);
      if (a === undefined) continue;
      overlap = overlap.add(Decimal.min(h.valueUsd.div(total), D(a.weightBps).div(10_000)));
    }
    if (overlap.gt(0) && (best === null || overlap.gt(best.overlap))) {
      best = { slug: t.slug, name: t.name, overlap };
    }
  }
  return best;
};

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
 * A basket that holds nothing Mercury lists is left out, unless it was just
 * withdrawn into the wallet: that is the moment the page says what to do with
 * what arrived.
 */
export async function findOutsideBaskets(
  deps: OutsideDeps,
  wallet: { readonly userId: string; readonly walletId: string; readonly address: string },
): Promise<readonly OutsideBasket[]> {
  const candidates = (await outsideCandidates(deps.db, wallet)).slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return [];
  const [listed, templates] = await Promise.all([deps.listed(), deps.templates?.() ?? Promise.resolve([])]);
  const now = deps.now?.() ?? new Date();
  const baskets: OutsideBasket[] = [];
  for (const candidate of candidates) {
    if (!(await isSwigAccount(deps.history, candidate))) continue;
    const balances = (await deps.chain.tokenBalances(candidate))
      .filter((b) => b.rawAmount > 0n && listed.has(b.mint))
      .map((b) => ({ mint: b.mint, raw: b.rawAmount }));
    const arrivals = await deps.db
      .select({ mint: historyEvents.mint, amountRaw: historyEvents.amountRaw, at: historyEvents.blockTime })
      .from(historyEvents)
      .where(
        and(
          eq(historyEvents.walletId, wallet.walletId),
          eq(historyEvents.kind, "in"),
          eq(historyEvents.sourceOwner, candidate),
          gte(historyEvents.blockTime, new Date(now.getTime() - ARRIVED_WITHIN_MS)),
        ),
      );
    const landed = new Map<string, bigint>();
    let latest: Date | null = null;
    for (const a of arrivals) {
      if (a.mint === null || a.amountRaw === null || !listed.has(a.mint)) continue;
      landed.set(a.mint, (landed.get(a.mint) ?? 0n) + a.amountRaw);
      if (a.at !== null && (latest === null || a.at > latest)) latest = a.at;
    }
    if (balances.length === 0 && landed.size === 0) continue;

    const mints = [...new Set([...balances.map((b) => b.mint), ...landed.keys()])];
    const prices = await deps.prices.pricesFor(mints);
    const holding = (mint: string, raw: bigint): Holding => {
      const about = listed.get(mint)!;
      const amount = D(raw.toString()).div(D(10).pow(about.decimals));
      const price = prices.get(mint)?.usdPricePerToken ?? ZERO;
      return { mint, symbol: about.symbol, ticker: about.ticker, amount, valueUsd: amount.mul(price) };
    };
    const largestFirst = (a: Holding, b: Holding) => b.valueUsd.comparedTo(a.valueUsd);
    const holdings = balances.map((b) => holding(b.mint, b.raw)).sort(largestFirst);
    const arrived = [...landed].map(([mint, raw]) => holding(mint, raw)).sort(largestFirst);
    baskets.push({
      address: candidate,
      valueUsd: holdings.reduce((s, h) => s.add(h.valueUsd), ZERO),
      holdings,
      arrived: arrived.length === 0 ? null : { at: latest ?? now, holdings: arrived },
      // What it held, or what came out of it: either says what the person was invested in.
      similar: closestBasket(holdings.length > 0 ? holdings : arrived, templates),
    });
  }
  return baskets;
}
