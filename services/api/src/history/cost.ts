import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { D, type Decimal, ZERO } from "@mercury/core";
import type { PastPriceSource, PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import {
  activities,
  historyEvents,
  historyJobs,
  historyTxs,
  instruments,
  lots,
  multiplierEvents,
  positions,
  priceBars,
  tokens,
  wallets,
  type HistoryEvent,
} from "../db/schema.js";
import { followed } from "../wallets/active.js";
import {
  dividendsSince,
  dollarCost,
  multiplierAt,
  replayAccount,
  replayWithDepartures,
  type ArrivalCost,
  type CostMovement,
  type Departure,
  type MultiplierStep,
  type PlannedLot,
} from "./cost-plan.js";
import { SOL_MINT } from "./events.js";
import { recordMoveIn } from "../moves/record.js";
import { moveTitles } from "../moves/names.js";

/** SOL's symbol at the historical source, for a swap paid in SOL. */
const SOL_SYMBOL = "SOL-USD";
const SOL_DECIMALS = 9;

export interface CostDeps {
  readonly db: Db;
  /** Prices at a past moment: Yahoo, hourly within two years and daily beyond. */
  readonly past: PastPriceSource;
  /** Today's prices: the last of the fallbacks, for a share no other rule could price. */
  readonly board: PriceBoard;
  /**
   * Skip the historical source and go to the next rule. Set once it has
   * failed for this wallet several passes in a row: the wallet waits for it
   * first, and gives up to Mercury's own prices only after repeated failures.
   */
  readonly skipPast?: boolean;
}

export interface CostResult {
  readonly lots: number;
  readonly dividends: number;
  readonly costed: number;
  /** The wallet's first costing finished, and its P&L is ready. */
  readonly ready: boolean;
}

const scaled = (raw: bigint, decimals: number) => D(raw.toString()).div(D(10).pow(decimals));
const fixed = (d: Decimal) => d.toFixed();

/**
 * The next wallet with movements to cost: read through its first read and
 * not yet costed, or ready with arrivals found since. Only a followed
 * wallet's: an unlinked one waits, as its reading does.
 */
export async function walletToCost(db: Db, resting: readonly string[] = []): Promise<string | null> {
  const [row] = await db
    .select({ walletId: historyJobs.walletId })
    .from(historyJobs)
    .innerJoin(wallets, eq(wallets.id, historyJobs.walletId))
    .where(
      and(
        followed,
        resting.length === 0 ? undefined : notInArray(historyJobs.walletId, [...resting]),
        sql`(${historyJobs.status} = 'read' or (${historyJobs.status} = 'done' and exists (
          select 1 from ${historyEvents}
          where ${historyEvents.walletId} = ${historyJobs.walletId} and ${historyEvents.costedAt} is null
        )))`,
      ),
    )
    .orderBy(asc(historyJobs.finishedAt))
    .limit(1);
  return row?.walletId ?? null;
}

/**
 * Turn what the history reader found in one linked wallet into lots, so its
 * shares have a cost and its P&L can be shown.
 *
 * **The first costing** replays each stock's movements oldest first, at
 * average cost, and writes what is still held as `chain` lots: a swap for
 * USDC or USDT at its exact cost; anything else at an estimate, marked, from
 * the first rule that answers (SOL's price then for a swap paid in SOL; the
 * cost it had in another of the person's wallets for a move between them; the
 * share's price then; the earliest price Mercury has; the price when the
 * wallet was linked). The dividends those lots earned since are their own
 * lots and rows, dated when each was seen. Then the wallet is `done`, and its
 * P&L stops saying "Calculating…".
 *
 * **Later costings** price only arrivals found since. A departure needs
 * nothing here: position-sync already takes shares that leave out of the
 * records, at average cost.
 *
 * All of it in one transaction, with every movement it took marked costed, so
 * a pass that fails writes nothing and the next one starts clean.
 */
export async function costWallet(deps: CostDeps, walletId: string, now: Date): Promise<CostResult> {
  const { db } = deps;
  const [wallet] = await db
    .select({
      userId: wallets.userId,
      address: wallets.address,
      linkedAt: wallets.linkedAt,
      label: wallets.label,
    })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1);
  if (wallet === undefined) return { lots: 0, dividends: 0, costed: 0, ready: false };
  const linkedAt = wallet.linkedAt ?? now;

  const pending = await db
    .select()
    .from(historyEvents)
    .where(and(eq(historyEvents.walletId, walletId), isNull(historyEvents.costedAt)))
    .orderBy(asc(historyEvents.blockTime), asc(historyEvents.id));
  const [costedBefore] = await db
    .select({ id: historyEvents.id })
    .from(historyEvents)
    .where(and(eq(historyEvents.walletId, walletId), isNotNull(historyEvents.costedAt)))
    .limit(1);
  const first = costedBefore === undefined;

  // The stocks among what moved: USDC and Earn shares are not lots.
  const mints = [...new Set(pending.map((e) => e.mint).filter((m): m is string => m !== null))];
  const stocks =
    mints.length === 0
      ? []
      : await db
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
          .where(inArray(tokens.mint, mints));
  const steps = await multiplierSteps(
    db,
    stocks.map((s) => s.tokenId),
  );
  const own = await ownWallets(db, wallet.userId, walletId);
  const mercury = await mercuryWalletOf(db, wallet.userId, walletId);
  // A send by hand to the person's Mercury wallet: a move, whose cost goes with it.
  const toMercury = (e: HistoryEvent) =>
    mercury !== null && e.kind === "out" && e.destinationOwner === mercury.address;

  const prices = pricer(deps, linkedAt);
  const written: { lot: PlannedLot; stock: (typeof stocks)[number] }[] = [];
  /** Moves to the Mercury wallet found on the first costing, with what the shares that left had cost. */
  const carried: {
    event: HistoryEvent;
    stock: (typeof stocks)[number];
    taken: Departure;
    multiplier: Decimal;
  }[] = [];
  /** Moves to the Mercury wallet found since: recorded from the wallet's lots, as the relayer's moves are. */
  const later: { event: HistoryEvent; stock: (typeof stocks)[number] }[] = [];
  const dividends: { shares: Decimal; at: Date; stock: (typeof stocks)[number] }[] = [];

  for (const stock of stocks) {
    const events = pending.filter((e) => e.mint === stock.mint);
    const tokenSteps = steps.get(stock.tokenId) ?? [];
    const current = D(stock.multiplier);
    const at = (e: HistoryEvent) => e.blockTime ?? linkedAt;

    const movements: CostMovement[] = [];
    for (const e of events) {
      if (e.amountRaw === null || e.amountRaw <= 0n) continue;
      // After the first costing, departures are position-sync's; only arrivals are priced here,
      // and a move to the Mercury wallet is carried there.
      if (!first && e.kind !== "in") {
        if (toMercury(e)) later.push({ event: e, stock });
        continue;
      }
      if (e.kind !== "in" && e.kind !== "out") continue;
      const multiplier = multiplierAt(at(e), tokenSteps, current);
      if (e.kind === "out") {
        movements.push({
          kind: "out",
          amountRaw: e.amountRaw,
          at: at(e),
          multiplier,
          ...(toMercury(e) ? { ref: e.id } : {}),
        });
        continue;
      }
      const shares = scaled(e.amountRaw, stock.decimals).mul(multiplier);
      const cost = await arrivalCost(deps, prices, own, stock, e, shares, at(e));
      movements.push({ kind: "in", amountRaw: e.amountRaw, at: at(e), multiplier, cost });
    }

    // What was held before the oldest movement read, where the walk back stopped at its cap.
    const opening = first
      ? await openingBalance(db, wallet.address, stock, events[0], tokenSteps, prices, linkedAt)
      : undefined;
    const { lots: planned, departures } = replayWithDepartures(movements, stock.decimals, opening);
    for (const lot of planned) written.push({ lot, stock });
    for (const taken of departures) {
      const event = events.find((e) => e.id === taken.ref)!;
      carried.push({ event, stock, taken, multiplier: multiplierAt(at(event), tokenSteps, current) });
    }
    for (const d of dividendsSince(planned, tokenSteps, stock.decimals)) dividends.push({ ...d, stock });
  }

  // A dividend row says what it was worth then; where no price answers, it says only the shares.
  const dividendRows: {
    shares: Decimal;
    at: Date;
    stock: (typeof stocks)[number];
    amountUsd: Decimal | null;
  }[] = [];
  for (const d of dividends) {
    const price = await prices.share(d.stock, d.at).catch(() => null);
    dividendRows.push({ ...d, amountUsd: price === null ? null : d.shares.mul(price.price) });
  }

  await db.transaction(async (tx) => {
    if (written.length > 0) {
      await tx.insert(lots).values(
        written.map(({ lot, stock }) => ({
          userId: wallet.userId,
          walletId,
          tokenId: stock.tokenId,
          instrumentId: stock.instrumentId,
          tokenQty: lot.tokenQty,
          shares: fixed(lot.shares),
          unitCostUsd: fixed(lot.unitCostUsd),
          feeUsd: "0",
          referencePriceUsd: lot.referencePriceUsd === null ? null : fixed(lot.referencePriceUsd),
          acquiredAt: lot.acquiredAt,
          recordedAt: now,
          source: "chain" as const,
          isEstimated: lot.estimateSource !== null,
          estimateSource: lot.estimateSource,
        })),
      );
    }
    if (dividendRows.length > 0) {
      await tx.insert(lots).values(
        dividendRows.map((d) => ({
          userId: wallet.userId,
          walletId,
          tokenId: d.stock.tokenId,
          instrumentId: d.stock.instrumentId,
          tokenQty: 0n,
          shares: fixed(d.shares),
          unitCostUsd: "0",
          feeUsd: "0",
          acquiredAt: d.at,
          recordedAt: now,
          source: "dividend" as const,
        })),
      );
      // Found in history: in the feed and the income line, dated when paid, and never announced as news.
      await tx.insert(activities).values(
        dividendRows.map((d) => ({
          userId: wallet.userId,
          walletId,
          kind: "dividend" as const,
          occurredAt: d.at,
          title: `${d.stock.ticker} dividend`,
          subtitle: `Paid as ${d.shares.toDecimalPlaces(6).toString()} shares · found in history`,
          amountUsd: d.amountUsd === null ? null : fixed(d.amountUsd),
          refTable: "token",
          refId: d.stock.tokenId,
        })),
      );
    }
    // Moves to the Mercury wallet: the shares arrive there with what they cost here.
    if (mercury !== null) {
      const titles = moveTitles(
        { label: wallet.label, address: wallet.address, isPrimary: false },
        { label: null, address: mercury.address, isPrimary: true },
      );
      for (const c of carried) {
        const at = c.event.blockTime ?? linkedAt;
        // The feed row here is the record that it was carried, as for a move the relayer sent.
        const [row] = await tx
          .insert(activities)
          .values({
            userId: wallet.userId,
            walletId,
            kind: "transfer_out",
            occurredAt: at,
            title: titles.out,
            subtitle: null,
            amountUsd: null,
            txSignature: c.event.signature,
            mint: c.stock.mint,
          })
          .onConflictDoNothing()
          .returning({ id: activities.id });
        if (row === undefined) continue;
        await tx
          .insert(activities)
          .values({
            userId: wallet.userId,
            walletId: mercury.id,
            kind: "transfer_in",
            occurredAt: at,
            title: titles.in,
            subtitle: null,
            amountUsd: null,
            txSignature: c.event.signature,
            mint: c.stock.mint,
          })
          .onConflictDoNothing();
        if (c.taken.tokenQty <= 0n || !c.taken.shares.gt(ZERO)) continue;
        await tx.insert(lots).values({
          userId: wallet.userId,
          walletId: mercury.id,
          tokenId: c.stock.tokenId,
          instrumentId: c.stock.instrumentId,
          tokenQty: c.taken.tokenQty,
          shares: fixed(scaled(c.taken.tokenQty, c.stock.decimals).mul(c.multiplier)),
          unitCostUsd: fixed(c.taken.costUsd.div(c.taken.shares)),
          feeUsd: "0",
          referencePriceUsd: fixed(c.taken.referenceUsd.div(c.taken.shares)),
          acquiredAt: at,
          recordedAt: now,
          source: "transfer_in" as const,
          isEstimated: c.taken.estimated,
          estimateSource: c.taken.estimated ? ("own_wallet" as const) : null,
        });
      }
      for (const l of later) {
        const at = l.event.blockTime ?? now;
        await recordMoveIn(tx, {
          userId: wallet.userId,
          fromWalletId: walletId,
          toWalletId: mercury.id,
          signature: l.event.signature,
          occurredAt: at,
          // Position-sync saw the shares leave after they did: its departure for them is this move.
          startedAt: new Date(at.getTime() - SEEN_EARLY_MS),
          moved: [{ mint: l.stock.mint, amountRaw: l.event.amountRaw! }],
        });
      }
    }
    if (pending.length > 0) {
      await tx
        .update(historyEvents)
        .set({ costedAt: now })
        .where(
          inArray(
            historyEvents.id,
            pending.map((e) => e.id),
          ),
        );
    }
    // Costed: the wallet's P&L is real now. A later costing leaves the status as it was.
    await tx
      .update(historyJobs)
      .set({ status: "done" })
      .where(and(eq(historyJobs.walletId, walletId), eq(historyJobs.status, "read")));
  });

  return { lots: written.length, dividends: dividendRows.length, costed: pending.length, ready: first };
}

type Stock = {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly mint: string;
  readonly decimals: number;
  readonly ticker: string;
};

/**
 * One arrival's cost, by the first rule that answers: exact from a dollar
 * swap; SOL's price then for a swap paid in SOL; the cost it had in another of
 * the person's wallets; then the share's own price, by the fallbacks below.
 */
async function arrivalCost(
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

  const from = e.sourceOwner === null ? undefined : own.get(e.sourceOwner);
  if (from !== undefined) {
    const [there] = await deps.db
      .select({ avg: positions.avgUnitCostUsd })
      .from(positions)
      .where(and(eq(positions.walletId, from), eq(positions.instrumentId, stock.instrumentId)))
      .limit(1);
    if (there !== undefined && D(there.avg).gt(ZERO)) {
      return { unitCostUsd: D(there.avg), referencePriceUsd: null, estimateSource: "own_wallet" };
    }
  }

  const price = await prices.share(stock, at);
  if (price === null) throw new Error(`no price answered for ${stock.ticker}`);
  return { unitCostUsd: price.price, referencePriceUsd: price.price, estimateSource: price.source };
}

/** What a stock's share cost at a moment, and which rule said so. */
function pricer(deps: CostDeps, linkedAt: Date) {
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
async function barClose(
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
 * Tokens held before the oldest movement read, where the walk back stopped
 * at its cap rather than at an empty balance: the balance just before that
 * movement, from the transaction kept raw, priced at the share's price then.
 */
async function openingBalance(
  db: Db,
  owner: string,
  stock: Stock,
  oldest: HistoryEvent | undefined,
  steps: readonly MultiplierStep[],
  prices: ReturnType<typeof pricer>,
  linkedAt: Date,
): Promise<Parameters<typeof replayAccount>[2]> {
  if (oldest === undefined) return undefined;
  const [tx] = await db
    .select({ raw: historyTxs.raw })
    .from(historyTxs)
    .where(eq(historyTxs.signature, oldest.signature));
  const pre = (
    (tx?.raw as { preTokens?: { owner: string | null; mint: string; rawAmount: string }[] } | undefined)
      ?.preTokens ?? []
  )
    .filter((t) => t.owner === owner && t.mint === stock.mint)
    .reduce((sum, t) => sum + BigInt(t.rawAmount), 0n);
  if (pre <= 0n) return undefined;
  const at = oldest.blockTime ?? linkedAt;
  const price = await prices.share(stock, at);
  if (price === null) throw new Error(`no price answered for ${stock.ticker}`);
  return {
    amountRaw: pre,
    at,
    multiplier: multiplierAt(at, steps, D(1)),
    // Held before the walk reached: the price then is an estimate whatever answered it.
    cost: { unitCostUsd: price.price, referencePriceUsd: price.price, estimateSource: price.source },
  };
}

/** Each token's multiplier rises as observed, oldest first. */
async function multiplierSteps(
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
    list.push({ at: r.observedAt, from: D(r.oldMultiplier), to: D(r.newMultiplier) });
    out.set(r.tokenId, list);
  }
  return out;
}

/** The person's other wallets, by address: a transfer from one is a move, and keeps the cost it had. */
/** How long before a move landed position-sync may have written its departure: clocks are not exact. */
const SEEN_EARLY_MS = 2 * 60_000;

/** The person's Mercury wallet, unless it is the one being costed. */
async function mercuryWalletOf(
  db: Db,
  userId: string,
  walletId: string,
): Promise<{ readonly id: string; readonly address: string } | null> {
  const [row] = await db
    .select({ id: wallets.id, address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isPrimary, true), ne(wallets.id, walletId)))
    .limit(1);
  return row ?? null;
}

async function ownWallets(db: Db, userId: string, walletId: string): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .select({ id: wallets.id, address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), ne(wallets.id, walletId)));
  return new Map(rows.map((r) => [r.address, r.id]));
}
