import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { D, type Decimal, ZERO } from "@mercury/core";
import type { PastPriceSource, PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import {
  activities,
  basketAccounts,
  disposals,
  historyEvents,
  historyJobs,
  historyTxs,
  instruments,
  lots,
  tokens,
  wallets,
  type HistoryEvent,
} from "../db/schema.js";
import { followed, stillFollowed, Unlinked } from "../wallets/active.js";
import {
  dividendsSince,
  multiplierAt,
  replayWithDepartures,
  type CostMovement,
  type Departure,
  type PlannedLot,
} from "./cost-plan.js";
import { planChainEarn, type ChainEarnMove, type EarnVault } from "./earn.js";
import { writeEarnRecord } from "../earn/store.js";
import { USDC_MINT } from "@mercury/chain";
import { recordMoveIn } from "../moves/record.js";
import { moveTitles } from "../moves/names.js";
import { arrivalCost, multiplierSteps, openingBalance, pricer, scaled } from "./cost-price.js";
import { laterCosting } from "./cost-later.js";
import { gapCash, mercuryWalletOf, ownWallets, SEEN_EARLY_MS } from "./cost-wallets.js";

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
  /**
   * Earn's vaults, by their share token's mint. With them, a linked wallet's
   * moves into and out of Earn are read from its share tokens into the Earn
   * ledger, so "earned so far" covers the time before linking. Absent, those
   * movements are marked costed and nothing more.
   */
  readonly earnVaults?: () => Promise<ReadonlyMap<string, EarnVault>>;
  /**
   * A vault's share price on a day, in dollars a share: what vault shares
   * that arrived or left with no USDC were worth then. Null when Kamino has
   * no figure for it. A transfer it cannot price waits, as a stock with no
   * price does, rather than be guessed. Absent, such transfers are left out.
   */
  readonly earnSharePrice?: (vault: string, at: Date) => Promise<Decimal | null>;
}

export interface CostResult {
  readonly lots: number;
  readonly dividends: number;
  readonly costed: number;
  /** The wallet's first costing finished, and its P&L is ready. */
  readonly ready: boolean;
}

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
        // Not while a walk is unfinished: its events so far are part of a pass, and a pass is costed whole, in order.
        sql`${historyJobs.walks} = '{}'::jsonb`,
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
 * **Later costings** write what happened since, in slot order: each arrival
 * priced as a lot, each departure as a `chain` departure (with what it
 * realised, where it was swapped for dollars), each send to the Mercury
 * wallet as a move carried there at what was held just before it. Position-
 * sync writes none of a costed linked wallet's departures (see `apply.ts`).
 *
 * **Collateral** pledged to Kamino and taken back moves nothing: the shares
 * left the wallet's account but not the person, and keep the lots and the
 * cost they had. Only a liquidation sells them, and that is the loan
 * history's to record (`settleLiquidations`).
 *
 * All of it in one transaction, with every movement it took marked costed, so
 * a pass that fails writes nothing and the next one starts clean.
 */
export async function costWallet(deps: CostDeps, walletId: string, now: Date): Promise<CostResult> {
  const costing = await loadCosting(deps, walletId, now);
  if (costing === null) return { lots: 0, dividends: 0, costed: 0, ready: false };
  const prices = pricer(deps, costing.linkedAt);
  const plan = await planStocks(deps, walletId, costing, prices);
  const dividendRows = await priceDividends(prices, plan.dividends);
  const earnPriced = await planEarn(deps, costing);
  const kept = await writeCosting(deps.db, walletId, now, costing, plan, dividendRows, earnPriced);
  if (!kept) return { lots: 0, dividends: 0, costed: 0, ready: false };

  return {
    lots: plan.written.length + plan.sequence.filter((s) => s.type === "lot").length,
    dividends: dividendRows.length,
    costed: costing.pending.length,
    ready: costing.first,
  };
}

/** A stock among what moved, as the costing reads it. */
type StockRow = {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly mint: string;
  readonly decimals: number;
  readonly multiplier: string;
  readonly ticker: string;
};

/**
 * What a costing works from: the wallet, its movements not yet costed in the
 * order they happened, whether this is its first costing, the stocks among
 * them, and the person's other wallets and baskets. Null for a wallet gone.
 */
async function loadCosting(deps: CostDeps, walletId: string, now: Date) {
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
  if (wallet === undefined) return null;
  const linkedAt = wallet.linkedAt ?? now;

  /*
   * In the order they happened: by slot, which the chain counts in, not by
   * block time, which is whole seconds. A buy and a sell in the same second
   * ordered by anything else (the event's id is random) replayed the sell
   * first half the time, found nothing held, and left the buy as shares
   * nobody holds.
   */
  const pending = (
    await db
      .select({ event: historyEvents, slot: historyTxs.slot })
      .from(historyEvents)
      .leftJoin(historyTxs, eq(historyTxs.signature, historyEvents.signature))
      .where(and(eq(historyEvents.walletId, walletId), isNull(historyEvents.costedAt)))
      .orderBy(asc(historyTxs.slot), asc(historyEvents.blockTime), asc(historyEvents.id))
  ).map((r) => r.event);
  /*
   * The first costing is the one that has never finished for this wallet, said
   * by the job itself (`costed_at`), not by whether any movement was costed: a
   * first costing can find none (an account whose past the node no longer
   * keeps has only its opening balance), and taking the next costing for a
   * first one again priced that opening a second time, and wrote its sales
   * with no realised figure. A link again keeps it: what happened while
   * unlinked is a later costing's.
   */
  const [job] = await db
    .select({ opening: historyJobs.opening, costedAt: historyJobs.costedAt })
    .from(historyJobs)
    .where(eq(historyJobs.walletId, walletId))
    .limit(1);
  const first = job === undefined || job.costedAt === null;
  // Shares held before the oldest transaction a first read reached, where it found no empty moment.
  const openings = first ? Object.values(job?.opening ?? {}) : [];

  // The stocks among what moved, or held from before what was read: USDC and Earn shares are not lots.
  const mints = [
    ...new Set([
      ...pending.map((e) => e.mint).filter((m): m is string => m !== null),
      ...openings.map((o) => o.mint),
    ]),
  ];
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
  /*
   * Shares out of one of the person's Mercury baskets, in kind: the basket's
   * own reconciler records those, with their share of what the basket cost
   * (a `basket_exit` lot). Read here as well, they were counted twice.
   */
  const baskets = new Set(
    (
      await db
        .select({ address: basketAccounts.address })
        .from(basketAccounts)
        .where(eq(basketAccounts.userId, wallet.userId))
    ).map((b) => b.address),
  );
  const fromOwnBasket = (e: HistoryEvent) =>
    e.kind === "in" && e.sourceOwner !== null && baskets.has(e.sourceOwner);
  const toMercury = (e: HistoryEvent) =>
    mercury !== null && e.kind === "out" && e.destinationOwner === mercury.address;

  // Cash that moved while the wallet was unlinked: for the feed, which the live job has nothing of.
  const gap = first ? [] : await gapCash(db, wallet, pending, linkedAt, now);

  return {
    wallet,
    linkedAt,
    pending,
    first,
    openings,
    stocks: stocks as readonly StockRow[],
    steps,
    own,
    mercury,
    fromOwnBasket,
    toMercury,
    gap,
  };
}

type Costing = NonNullable<Awaited<ReturnType<typeof loadCosting>>>;

/**
 * Each stock's movements, costed: on the first costing, replayed oldest first
 * into the lots still held (and the moves to the Mercury wallet found on the
 * way); on a later one, each buy, sale and move in its place. And the
 * dividends the lots earned since.
 */
async function planStocks(deps: CostDeps, walletId: string, c: Costing, prices: ReturnType<typeof pricer>) {
  const { pending, first, openings, stocks, steps, own, linkedAt, fromOwnBasket, toMercury } = c;
  const written: { lot: PlannedLot; stock: StockRow }[] = [];
  /** Moves to the Mercury wallet found on the first costing, with what the shares that left had cost. */
  const carried: {
    event: HistoryEvent;
    stock: StockRow;
    taken: Departure;
    multiplier: Decimal;
  }[] = [];
  const dividends: { shares: Decimal; at: Date; split?: boolean; stock: StockRow }[] = [];

  /**
   * A later costing's writes, in the order they happened: each buy as a lot,
   * each sale as a departure, each send to the Mercury wallet as a move carried
   * there at what was held just before it.
   */
  const sequence: (
    | { readonly type: "lot"; readonly lot: PlannedLot; readonly stock: StockRow }
    | {
        readonly type: "out";
        readonly event: HistoryEvent;
        readonly shares: Decimal;
        readonly realisedUsd: Decimal | null;
        readonly stock: StockRow;
      }
    | { readonly type: "move"; readonly event: HistoryEvent; readonly stock: StockRow }
  )[] = [];

  for (const stock of stocks) {
    const events = pending.filter((e) => e.mint === stock.mint);
    const tokenSteps = steps.get(stock.tokenId) ?? [];
    const current = D(stock.multiplier);
    const at = (e: HistoryEvent) => e.blockTime ?? linkedAt;

    if (!first) {
      const arrived = await laterCosting(
        deps,
        prices,
        own,
        walletId,
        stock,
        events,
        tokenSteps,
        current,
        at,
        toMercury,
        fromOwnBasket,
      );
      for (const step of arrived.sequence) sequence.push({ ...step, stock });
      for (const d of dividendsSince(arrived.lots, tokenSteps, stock.decimals))
        dividends.push({ ...d, stock });
      continue;
    }

    const movements: CostMovement[] = [];
    for (const e of events) {
      if (e.amountRaw === null || e.amountRaw <= 0n) continue;
      if (fromOwnBasket(e)) continue;
      // A pledge to Kamino or a withdrawal from it: the shares stayed the person's, at their cost.
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

    // What was held before the oldest transaction read, where the first read found no empty moment.
    const opening = await openingBalance(
      stock,
      openings.filter((o) => o.mint === stock.mint),
      tokenSteps,
      prices,
      linkedAt,
    );
    const { lots: planned, departures } = replayWithDepartures(movements, stock.decimals, opening);
    for (const lot of planned) written.push({ lot, stock });
    for (const taken of departures) {
      const event = events.find((e) => e.id === taken.ref)!;
      carried.push({ event, stock, taken, multiplier: multiplierAt(at(event), tokenSteps, current) });
    }
    for (const d of dividendsSince(planned, tokenSteps, stock.decimals)) dividends.push({ ...d, stock });
  }

  return { written, carried, dividends, sequence };
}

type StockPlan = Awaited<ReturnType<typeof planStocks>>;

/** Each dividend with what it was worth then, from the share's price; a split, with no amount. */
async function priceDividends(prices: ReturnType<typeof pricer>, dividends: StockPlan["dividends"]) {
  // A dividend row says what it was worth then; where no price answers, it says only the shares.
  const dividendRows: {
    shares: Decimal;
    at: Date;
    split?: boolean;
    stock: StockRow;
    amountUsd: Decimal | null;
  }[] = [];
  for (const d of dividends) {
    // A split earned nothing: no price asked, no amount.
    const price = d.split === true ? null : await prices.share(d.stock, d.at).catch(() => null);
    dividendRows.push({ ...d, amountUsd: price === null ? null : d.shares.mul(price.price) });
  }

  return dividendRows;
}

/** Moves into and out of Earn, from the vault share tokens' history, each with its dollars. */
async function planEarn(deps: CostDeps, c: Costing) {
  const { db } = deps;
  const { pending, wallet, linkedAt } = c;
  // Moves into and out of Earn, from the vault share tokens' history.
  const vaults = deps.earnVaults === undefined ? new Map<string, EarnVault>() : await deps.earnVaults();
  const earnPending = pending.filter((e) => e.mint !== null && vaults.has(e.mint));
  const earnRaw =
    earnPending.length === 0
      ? new Map<string, unknown>()
      : new Map(
          (
            await db
              .select({ signature: historyTxs.signature, raw: historyTxs.raw })
              .from(historyTxs)
              .where(
                inArray(
                  historyTxs.signature,
                  earnPending.map((e) => e.signature),
                ),
              )
          ).map((r) => [r.signature, r.raw]),
        );
  const earnMoves = planChainEarn(
    earnPending.map((e) => ({ ...e, raw: earnRaw.get(e.signature) ?? null })),
    vaults,
    wallet.address,
    USDC_MINT,
    linkedAt,
  );

  // Shares that moved without dollars: worth what the vault's share price said that day.
  const earnPriced: (ChainEarnMove & { readonly usdc: Decimal })[] = [];
  for (const move of earnMoves) {
    if (move.usdc !== null) {
      earnPriced.push({ ...move, usdc: move.usdc });
      continue;
    }
    if (deps.earnSharePrice === undefined || move.transferShares === undefined) continue;
    const price = await deps.earnSharePrice(move.vault, move.occurredAt);
    if (price === null) {
      // After repeated failures, left out rather than holding every stock's cost up with it.
      if (deps.skipPast === true) continue;
      throw new Error(`no share price for Earn vault ${move.vault} on that day`);
    }
    earnPriced.push({ ...move, usdc: move.transferShares.mul(price) });
  }

  return earnPriced;
}

/**
 * Everything a costing found, written in one transaction, with every movement
 * it took marked costed, so a pass that fails writes nothing and the next one
 * starts clean. False, writing nothing, for a wallet unlinked since it began.
 */
async function writeCosting(
  db: Db,
  walletId: string,
  now: Date,
  c: Costing,
  plan: StockPlan,
  dividendRows: Awaited<ReturnType<typeof priceDividends>>,
  earnPriced: Awaited<ReturnType<typeof planEarn>>,
): Promise<boolean> {
  const w: Writing = { walletId, now, c, plan, dividendRows };
  const { wallet } = c;
  const kept = await db
    .transaction(async (tx) => {
      // A wallet unlinked since this costing began is frozen as it was: nothing written.
      if (!(await stillFollowed(tx, walletId))) throw new Unlinked();
      for (const move of earnPriced) {
        await writeEarnRecord(tx, {
          ...move,
          userId: wallet.userId,
          walletId,
          origin: "chain",
          transfer: move.transferShares !== undefined,
        });
      }
      await writeFirstLots(tx, w);
      await writeInOrder(tx, w);
      await writeDividends(tx, w);
      await writeCarried(tx, w);
      await writeGapCash(tx, w);
      await markCosted(tx, w);
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof Unlinked) return false;
      throw error;
    });
  return kept;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** What each writer of a costing reads. */
type Writing = {
  readonly walletId: string;
  readonly now: Date;
  readonly c: Costing;
  readonly plan: StockPlan;
  readonly dividendRows: Awaited<ReturnType<typeof priceDividends>>;
};

/** A first costing's lots: what is still held, at what it cost. */
async function writeFirstLots(tx: Tx, w: Writing): Promise<void> {
  const { walletId, now } = w;
  const { wallet } = w.c;
  const { written } = w.plan;
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
}

/** A later costing's buys, sales and moves, each recorded a moment after the last, in the order they happened. */
async function writeInOrder(tx: Tx, w: Writing): Promise<void> {
  const { walletId, now } = w;
  const { wallet, mercury } = w.c;
  const { sequence } = w.plan;
  // In the order they happened, each recorded a moment after the last, so the replay
  // takes a sale out of what was held before a buy that followed it.
  let tick = 0;
  for (const step of sequence) {
    const recordedAt = new Date(now.getTime() + tick++);
    if (step.type === "move") {
      // In its place: the cost it carries is what was held just before it, not after a buy that followed.
      if (mercury === null) continue;
      const at = step.event.blockTime ?? now;
      await recordMoveIn(tx, {
        userId: wallet.userId,
        fromWalletId: walletId,
        toWalletId: mercury.id,
        signature: step.event.signature,
        occurredAt: at,
        startedAt: new Date(at.getTime() - SEEN_EARLY_MS),
        moved: [{ mint: step.stock.mint, amountRaw: step.event.amountRaw! }],
        recordedAt,
      });
      continue;
    }
    if (step.type === "lot") {
      await tx.insert(lots).values({
        userId: wallet.userId,
        walletId,
        tokenId: step.stock.tokenId,
        instrumentId: step.stock.instrumentId,
        tokenQty: step.lot.tokenQty,
        shares: fixed(step.lot.shares),
        unitCostUsd: fixed(step.lot.unitCostUsd),
        feeUsd: "0",
        referencePriceUsd: step.lot.referencePriceUsd === null ? null : fixed(step.lot.referencePriceUsd),
        acquiredAt: step.lot.acquiredAt,
        recordedAt,
        source: "chain" as const,
        isEstimated: step.lot.estimateSource !== null,
        estimateSource: step.lot.estimateSource,
      });
      continue;
    }
    await tx.insert(disposals).values({
      userId: wallet.userId,
      walletId,
      tokenId: step.stock.tokenId,
      instrumentId: step.stock.instrumentId,
      tokenQty: step.event.amountRaw!,
      shares: fixed(step.shares),
      kind: "chain" as const,
      occurredAt: step.event.blockTime ?? now,
      recordedAt,
      realisedPnlUsd: step.realisedUsd === null ? null : fixed(step.realisedUsd),
    });
  }
}

/** Dividends and splits found in history: lots at no cost, and their rows in the feed, never news. */
async function writeDividends(tx: Tx, w: Writing): Promise<void> {
  const { walletId, now, dividendRows } = w;
  const { wallet } = w.c;
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
        source: d.split === true ? ("split" as const) : ("dividend" as const),
      })),
    );
    // Found in history: in the feed and the income line, dated when paid, and never announced as news.
    // A split is in the feed as one, with no amount, and never in income.
    await tx.insert(activities).values(
      dividendRows.map((d) => ({
        userId: wallet.userId,
        walletId,
        kind: d.split === true ? ("split" as const) : ("dividend" as const),
        occurredAt: d.at,
        title: d.split === true ? `${d.stock.ticker} stock split` : `${d.stock.ticker} dividend`,
        subtitle:
          d.split === true
            ? `${d.shares.toDecimalPlaces(6).toString()} more shares, each worth less · found in history`
            : `Paid as ${d.shares.toDecimalPlaces(6).toString()} shares · found in history`,
        amountUsd: d.amountUsd === null ? null : fixed(d.amountUsd),
        refTable: "token",
        refId: d.stock.tokenId,
      })),
    );
  }
}

/** Moves to the Mercury wallet found on a first costing: both feed rows, and the shares' cost carried there. */
async function writeCarried(tx: Tx, w: Writing): Promise<void> {
  const { walletId, now } = w;
  const { wallet, linkedAt, mercury } = w.c;
  const { carried } = w.plan;
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
  }
}

/** Cash that moved while the wallet was unlinked, in its feed, found in history and never news. */
async function writeGapCash(tx: Tx, w: Writing): Promise<void> {
  const { walletId } = w;
  const { wallet, gap } = w.c;
  // Found in history, so it reads as such, and is never news: no inbox entry, whatever it was.
  if (gap.length > 0) {
    await tx
      .insert(activities)
      .values(
        gap.map((m) => ({
          userId: wallet.userId,
          walletId,
          kind: m.kind,
          occurredAt: m.occurredAt,
          title: m.title,
          subtitle: m.subtitle === null ? "Found in history" : `${m.subtitle} · found in history`,
          amountUsd: m.amountUsd === null ? null : fixed(m.amountUsd),
          ...(m.basketPortfolioId === undefined ? {} : { basketPortfolioId: m.basketPortfolioId }),
          txSignature: m.signature,
          mint: m.mint,
        })),
      )
      .onConflictDoNothing({ target: [activities.walletId, activities.txSignature, activities.mint] });
  }
}

/** Every movement taken marked costed, and the wallet ready once its first costing is done. */
async function markCosted(tx: Tx, w: Writing): Promise<void> {
  const { walletId, now } = w;
  const { pending, first } = w.c;
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
  if (first) {
    await tx
      .update(historyJobs)
      .set({ costedAt: now })
      .where(and(eq(historyJobs.walletId, walletId), isNull(historyJobs.costedAt)));
  }
}
