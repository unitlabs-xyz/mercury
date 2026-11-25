import { and, asc, desc, eq, inArray, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import {
  D,
  EMPTY_OPEN,
  replayPosition,
  type Decimal,
  type Movement,
  type OpenPosition,
  ZERO,
} from "@mercury/core";
import { movementsByToken } from "../portfolio/open.js";
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
  multiplierEvents,
  positions,
  priceBars,
  tokens,
  wallets,
  type HistoryEvent,
} from "../db/schema.js";
import { followed, stillFollowed, Unlinked } from "../wallets/active.js";
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
import { planChainEarn, type ChainEarnMove, type EarnVault } from "./earn.js";
import { writeEarnRecord } from "../earn/store.js";
import { USDC_MINT } from "@mercury/chain";
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

  const prices = pricer(deps, linkedAt);
  const written: { lot: PlannedLot; stock: (typeof stocks)[number] }[] = [];
  /** Moves to the Mercury wallet found on the first costing, with what the shares that left had cost. */
  const carried: {
    event: HistoryEvent;
    stock: (typeof stocks)[number];
    taken: Departure;
    multiplier: Decimal;
  }[] = [];
  const dividends: { shares: Decimal; at: Date; split?: boolean; stock: (typeof stocks)[number] }[] = [];

  /**
   * A later costing's writes, in the order they happened: each buy as a lot,
   * each sale as a departure, each send to the Mercury wallet as a move carried
   * there at what was held just before it.
   */
  const sequence: (
    | { readonly type: "lot"; readonly lot: PlannedLot; readonly stock: (typeof stocks)[number] }
    | {
        readonly type: "out";
        readonly event: HistoryEvent;
        readonly shares: Decimal;
        readonly realisedUsd: Decimal | null;
        readonly stock: (typeof stocks)[number];
      }
    | { readonly type: "move"; readonly event: HistoryEvent; readonly stock: (typeof stocks)[number] }
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

  // A dividend row says what it was worth then; where no price answers, it says only the shares.
  const dividendRows: {
    shares: Decimal;
    at: Date;
    split?: boolean;
    stock: (typeof stocks)[number];
    amountUsd: Decimal | null;
  }[] = [];
  for (const d of dividends) {
    // A split earned nothing: no price asked, no amount.
    const price = d.split === true ? null : await prices.share(d.stock, d.at).catch(() => null);
    dividendRows.push({ ...d, amountUsd: price === null ? null : d.shares.mul(price.price) });
  }

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
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof Unlinked) return false;
      throw error;
    });
  if (!kept) return { lots: 0, dividends: 0, costed: 0, ready: false };

  return {
    lots: written.length + sequence.filter((s) => s.type === "lot").length,
    dividends: dividendRows.length,
    costed: pending.length,
    ready: first,
  };
}

/** One write of a later costing, in the order it happened. */
type LaterStep =
  | { readonly type: "lot"; readonly lot: PlannedLot }
  | {
      readonly type: "out";
      readonly event: HistoryEvent;
      readonly shares: Decimal;
      readonly realisedUsd: Decimal | null;
    }
  | { readonly type: "move"; readonly event: HistoryEvent };

/**
 * A later costing of one stock: its new arrivals priced as lots, and its
 * departures as departures, each in the order it happened, so a sale takes
 * out what was held before a buy that came after it. Position-sync can't do
 * this for a linked wallet: a sale and a buy back between two of its looks
 * read as nothing having happened, and the shares sold would then leave later,
 * at the average of the old and the new.
 *
 * A sale swapped for dollars realises what it was swapped for, less the
 * average cost of the shares just before it. A send to the Mercury wallet is
 * a move, carried there with its cost (`toMercury`); a pledge is nothing.
 */
async function laterCosting(
  deps: CostDeps,
  prices: ReturnType<typeof pricer>,
  own: ReadonlyMap<string, string>,
  walletId: string,
  stock: Stock & { readonly instrumentId: string },
  events: readonly HistoryEvent[],
  steps: readonly MultiplierStep[],
  current: Decimal,
  at: (e: HistoryEvent) => Date,
  toMercury: (e: HistoryEvent) => boolean,
  fromOwnBasket: (e: HistoryEvent) => boolean,
): Promise<{ readonly sequence: readonly LaterStep[]; readonly lots: readonly PlannedLot[] }> {
  const sequence: LaterStep[] = [];
  const arrived: PlannedLot[] = [];
  let held = await heldNow(deps.db, walletId, stock.tokenId);

  for (const e of events) {
    if (e.amountRaw === null || e.amountRaw <= 0n || fromOwnBasket(e)) continue;
    const multiplier = multiplierAt(at(e), steps, current);
    const shares = scaled(e.amountRaw, stock.decimals).mul(multiplier);
    if (e.kind === "in") {
      const cost = await arrivalCost(deps, prices, own, stock, e, shares, at(e));
      const lot: PlannedLot = {
        tokenQty: e.amountRaw,
        shares,
        unitCostUsd: cost.unitCostUsd,
        referencePriceUsd: cost.referencePriceUsd,
        estimateSource: cost.estimateSource,
        acquiredAt: at(e),
        multiplier,
      };
      sequence.push({ type: "lot", lot });
      arrived.push(lot);
      held = replayPosition([
        ...asMovements(held),
        {
          kind: "in",
          tokenQty: lot.tokenQty,
          shares,
          costUsd: shares.mul(lot.unitCostUsd),
          referenceUsd: shares.mul(lot.referencePriceUsd ?? lot.unitCostUsd),
          feeUsd: ZERO,
          acquiredAt: lot.acquiredAt,
          isEstimated: lot.estimateSource !== null,
        },
      ]);
      continue;
    }
    if (e.kind !== "out") continue; // a pledge or a withdrawal: the shares stayed the person's
    if (toMercury(e)) {
      // A move to the Mercury wallet, carried there in its place in the sequence.
      sequence.push({ type: "move", event: e });
      held = replayPosition([...asMovements(held), { kind: "out", tokenQty: e.amountRaw }]);
      continue;
    }
    // Swapped for dollars: what they fetched, less their share of what was held, at average cost.
    const proceeds = dollarCost(e.counterMint, e.counterAmountRaw, D(1));
    const realisedUsd =
      proceeds === null || held.tokenQty <= 0n || e.amountRaw > held.tokenQty
        ? null
        : proceeds.sub(held.costUsd.mul(D(e.amountRaw.toString())).div(D(held.tokenQty.toString())));
    sequence.push({ type: "out", event: e, shares, realisedUsd });
    held = replayPosition([...asMovements(held), { kind: "out", tokenQty: e.amountRaw }]);
  }
  return { sequence, lots: arrived };
}

/** An open position as the one movement that would make it, to replay more onto. */
const asMovements = (open: OpenPosition): Movement[] =>
  open.tokenQty === 0n
    ? []
    : [
        {
          kind: "in",
          tokenQty: open.tokenQty,
          shares: open.shares,
          costUsd: open.costUsd,
          referenceUsd: open.referenceUsd,
          feeUsd: open.feeUsd,
          acquiredAt: open.heldSince ?? new Date(0),
          isEstimated: open.isEstimated,
        },
      ];

/** What the wallet's records hold of a token now: every lot and departure, in the order recorded. */
async function heldNow(db: Db, walletId: string, tokenId: string): Promise<OpenPosition> {
  const [lotRows, disposalRows] = await Promise.all([
    db
      .select()
      .from(lots)
      .where(and(eq(lots.walletId, walletId), eq(lots.tokenId, tokenId))),
    db
      .select()
      .from(disposals)
      .where(and(eq(disposals.walletId, walletId), eq(disposals.tokenId, tokenId))),
  ]);
  const moves = movementsByToken(
    lotRows.map((l) => ({ ...l, recordedAtUs: l.recordedAt.getTime() * 1000 })),
    disposalRows.map((d) => ({ ...d, recordedAtUs: d.recordedAt.getTime() * 1000 })),
  ).get(tokenId);
  return moves === undefined ? EMPTY_OPEN : replayPosition(moves);
}

type Stock = {
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
 * Tokens held before the oldest transaction a first read reached, where it
 * never reached a moment the wallet held none: the reader's own figure, in the
 * account and pledged to Kamino together (`history_job.opening`), priced at
 * the share's price then and marked estimated whatever answered.
 *
 * Only that. The balance before the oldest *event* is not used: a buy through
 * Mercury is no event (it is in Mercury's books already, at its exact cost),
 * so shares it bought would be read as held from before and counted twice.
 */
async function openingBalance(
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
    list.push({ at: r.observedAt, from: D(r.oldMultiplier), to: D(r.newMultiplier), kind: r.kind });
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
