import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { D, type Decimal, ZERO } from "@mercury/core";
import type { Db } from "../db/client.js";
import { instruments, multiplierEvents, priceBars, tokens, type HistoryEvent } from "../db/schema.js";
import {
  dollarCost,
  multiplierAt,
  replayAccount,
  type ArrivalCost,
  type MultiplierStep,
} from "./cost-plan.js";
import { SOL_MINT } from "./events.js";
import { heldBefore } from "../lending/liquidation-pnl.js";
import type { CostDeps } from "./cost.js";

/** What one stock's shares cost at a moment, by the rules in `cost.ts`: the prices and the pieces they need. */

/** SOL's symbol at the historical source, for a swap paid in SOL. */
const SOL_SYMBOL = "SOL-USD";
const SOL_DECIMALS = 9;

export const scaled = (raw: bigint, decimals: number) => D(raw.toString()).div(D(10).pow(decimals));

export type Stock = {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly mint: string;
  readonly decimals: number;
  readonly ticker: string;
  /** The multiplier now: what a token stands for where no recorded step says otherwise. */
  readonly multiplier?: string;
};

/**
 * One arrival's cost, by the first rule that answers: exact from a dollar
 * swap; SOL's price then for a swap paid in SOL; what another listed stock
 * paid with was worth then; the cost it had in another of the person's
 * wallets just before it left; then the share's own price, by the fallbacks below.
 */
export async function arrivalCost(
  deps: CostDeps,
  prices: ReturnType<typeof pricer>,
  own: ReadonlyMap<string, string>,
  stock: Stock,
  e: HistoryEvent,
  shares: Decimal,
  at: Date,
): Promise<ArrivalCost> {
  const exact = dollarCost(e.counterMint, e.counterAmountRaw, shares);
  if (exact !== null) return { unitCostUsd: exact, referencePriceUsd: null, estimateSource: null };

  if (
    e.counterMint === SOL_MINT &&
    e.counterAmountRaw !== null &&
    shares.gt(ZERO) &&
    deps.skipPast !== true
  ) {
    const sol = await deps.past.priceAt(SOL_SYMBOL, at);
    if (sol !== null) {
      return {
        unitCostUsd: scaled(e.counterAmountRaw, SOL_DECIMALS).mul(sol).div(shares),
        referencePriceUsd: null,
        estimateSource: "sol_price",
      };
    }
  }

  /*
   * Paid for with another stock Mercury lists: what those shares were worth
   * then, by the same rules as any share's price. An estimate, marked as one.
   * A token Mercury doesn't list has no price to ask, and the arrival is
   * priced at its own share's price, below.
   */
  if (
    e.counterMint !== null &&
    e.counterMint !== stock.mint &&
    e.counterAmountRaw !== null &&
    shares.gt(ZERO)
  ) {
    const [paidWith] = await deps.db
      .select({
        tokenId: tokens.id,
        instrumentId: tokens.instrumentId,
        mint: tokens.mint,
        decimals: tokens.decimals,
        multiplier: tokens.multiplier,
        ticker: instruments.ticker,
      })
      .from(tokens)
      .innerJoin(instruments, eq(instruments.id, tokens.instrumentId))
      .where(eq(tokens.mint, e.counterMint))
      .limit(1);
    if (paidWith !== undefined) {
      const steps = (await multiplierSteps(deps.db, [paidWith.tokenId])).get(paidWith.tokenId) ?? [];
      const paidShares = scaled(e.counterAmountRaw, paidWith.decimals).mul(
        multiplierAt(at, steps, D(paidWith.multiplier)),
      );
      const price = await prices.share(paidWith, at);
      if (price !== null) {
        return {
          unitCostUsd: paidShares.mul(price.price).div(shares),
          referencePriceUsd: null,
          estimateSource: "token_price",
        };
      }
    }
  }

  /*
   * Sent from another of the person's wallets: the cost the shares had there
   * just before they left, exact where that was exact. Not that wallet's cost
   * today, which later buys and sales there have moved since. Where that
   * wallet held no cost for them then, the arrival is priced as one from
   * outside, below.
   */
  const from = e.sourceOwner === null ? undefined : own.get(e.sourceOwner);
  if (from !== undefined) {
    const there = await heldBefore(deps.db, from, stock.tokenId, at);
    if (there.tokenQty > 0n && there.shares.gt(ZERO) && there.costUsd.gt(ZERO)) {
      return {
        unitCostUsd: there.costUsd.div(there.shares),
        referencePriceUsd: there.referenceUsd.div(there.shares),
        estimateSource: there.isEstimated ? "own_wallet" : null,
      };
    }
  }

  const price = await prices.share(stock, at);
  if (price === null) throw new Error(`no price answered for ${stock.ticker}`);
  return { unitCostUsd: price.price, referencePriceUsd: price.price, estimateSource: price.source };
}

/** What a stock's share cost at a moment, and which rule said so. */
export function pricer(deps: CostDeps, linkedAt: Date) {
  return {
    async share(
      stock: Stock,
      at: Date,
    ): Promise<{ price: Decimal; source: ArrivalCost["estimateSource"] & string } | null> {
      if (deps.skipPast !== true) {
        // A failing source throws: the wallet waits for it rather than taking a worse price at once.
        const past = await deps.past.priceAt(stock.ticker, at);
        if (past !== null) return { price: past, source: "market_price" };
      }
      const earliest = await barClose(deps.db, stock.tokenId, "earliest", linkedAt);
      if (earliest !== null) return { price: earliest, source: "earliest_price" };
      const linkDay = await barClose(deps.db, stock.tokenId, "link_day", linkedAt);
      if (linkDay !== null) return { price: linkDay, source: "link_day_price" };
      const board = (await deps.board.pricesFor([stock.mint])).get(stock.mint);
      const today = board?.pricePerShare ?? null;
      return today === null ? null : { price: today, source: "link_day_price" };
    },
  };
}

/**
 * A close from Mercury's own price bars: the earliest it has for the token,
 * or the last at or before the day the wallet was linked. The issuer's quote
 * for the share where the bar has one, else what the token traded at.
 */
export async function barClose(
  db: Db,
  tokenId: string,
  which: "earliest" | "link_day",
  linkedAt: Date,
): Promise<Decimal | null> {
  const [bar] = await db
    .select({
      reference: priceBars.referenceClose,
      market: priceBars.marketClose,
      multiplier: priceBars.multiplier,
    })
    .from(priceBars)
    .where(
      which === "earliest"
        ? eq(priceBars.tokenId, tokenId)
        : and(eq(priceBars.tokenId, tokenId), lte(priceBars.bucketStart, linkedAt)),
    )
    .orderBy(which === "earliest" ? asc(priceBars.bucketStart) : desc(priceBars.bucketStart))
    .limit(1);
  if (bar === undefined) return null;
  return bar.reference !== null ? D(bar.reference) : D(bar.market);
}

/**
 * Tokens held before the oldest transaction a first read reached, where it
 * never reached a moment the wallet held none: the reader's own figure, in the
 * account and pledged to Kamino together (`history_job.opening`), priced at
 * the share's price then and marked estimated whatever answered.
 *
 * Only that. The balance before the oldest *event* is not used: a buy through
 * Mercury is no event (it is in Mercury's books already, at its exact cost),
 * so shares it bought would be read as held from before and counted twice.
 */
export async function openingBalance(
  stock: Stock,
  openings: readonly { readonly raw: string; readonly at: string | null }[],
  steps: readonly MultiplierStep[],
  prices: ReturnType<typeof pricer>,
  linkedAt: Date,
): Promise<Parameters<typeof replayAccount>[2]> {
  const raw = openings.reduce((sum, o) => sum + BigInt(o.raw), 0n);
  if (raw <= 0n) return undefined;
  // The earliest of the token's accounts, where it has more than one.
  const at = openings
    .map((o) => (o.at === null ? linkedAt : new Date(o.at)))
    .reduce((a, b) => (b < a ? b : a));
  const price = await prices.share(stock, at);
  if (price === null) throw new Error(`no price answered for ${stock.ticker}`);
  return {
    amountRaw: raw,
    at,
    multiplier: multiplierAt(at, steps, D(stock.multiplier ?? 1)),
    // Held before the walk reached: the price then is an estimate whatever answered it.
    cost: { unitCostUsd: price.price, referencePriceUsd: price.price, estimateSource: price.source },
  };
}

/** Each token's multiplier rises as observed, oldest first. */
export async function multiplierSteps(
  db: Db,
  tokenIds: readonly string[],
): Promise<ReadonlyMap<string, MultiplierStep[]>> {
  if (tokenIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(multiplierEvents)
    .where(inArray(multiplierEvents.tokenId, tokenIds))
    .orderBy(asc(multiplierEvents.observedAt));
  const out = new Map<string, MultiplierStep[]>();
  for (const r of rows) {
    const list = out.get(r.tokenId) ?? [];
    list.push({ at: r.observedAt, from: D(r.oldMultiplier), to: D(r.newMultiplier), kind: r.kind });
    out.set(r.tokenId, list);
  }
  return out;
}
