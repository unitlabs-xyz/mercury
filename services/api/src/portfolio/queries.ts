import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, max, sql, sum } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, instruments, lots, portfolioSnapshots, positions, tokens } from "../db/schema.js";
import type { EstimateSource } from "@mercury/types";
import { USDC_MINT } from "@mercury/chain";
import type { HoldingRow } from "../routes/portfolio.js";
import type { Flow, Reading } from "./history.js";
import type { BasketMovement, InKindExit } from "./basket-basis.js";
import type { WalletOwner } from "../wallets/active.js";

/**
 * Every instrument one wallet has a position row for, with the wrappers that
 * belong to it. One query plus one, rather than a join that would repeat the
 * position across its wrappers and have to be folded back up.
 */
export async function readHoldings(db: Db, userId: string, walletId: string): Promise<readonly HoldingRow[]> {
  const rows = await db
    .select({
      instrumentId: positions.instrumentId,
      ticker: instruments.ticker,
      name: instruments.name,
      shares: positions.shares,
      sharesWithBasis: positions.sharesWithBasis,
      costBasisUsd: positions.costBasisUsd,
      referenceBasisUsd: positions.referenceBasisUsd,
      feeUsd: positions.feeUsd,
      avgUnitCostUsd: positions.avgUnitCostUsd,
      estimatedCostUsd: positions.estimatedCostUsd,
    })
    .from(positions)
    .innerJoin(instruments, eq(instruments.id, positions.instrumentId))
    .where(and(eq(positions.userId, userId), eq(positions.walletId, walletId)));

  if (rows.length === 0) return [];

  /*
   * Where each holding's estimated cost mostly came from, for the line that
   * says so: of the wallet's estimated lots, the source behind the most cost.
   */
  const estimated = await db
    .select({
      instrumentId: lots.instrumentId,
      source: lots.estimateSource,
      costUsd: sql<string>`sum(${lots.shares} * ${lots.unitCostUsd})`,
    })
    .from(lots)
    .where(and(eq(lots.walletId, walletId), eq(lots.isEstimated, true), isNotNull(lots.estimateSource)))
    .groupBy(lots.instrumentId, lots.estimateSource);
  const mainSource = new Map<string, { source: EstimateSource; costUsd: Decimal }>();
  for (const e of estimated) {
    if (e.source === null) continue;
    const seen = mainSource.get(e.instrumentId);
    if (seen === undefined || D(e.costUsd).gt(seen.costUsd)) {
      mainSource.set(e.instrumentId, { source: e.source, costUsd: D(e.costUsd) });
    }
  }

  const wrappers = await db
    .select({
      instrumentId: tokens.instrumentId,
      mint: tokens.mint,
      symbol: tokens.symbol,
      issuer: tokens.issuer,
      decimals: tokens.decimals,
    })
    .from(tokens);

  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    ticker: row.ticker,
    name: row.name,
    shares: D(row.shares),
    sharesWithBasis: D(row.sharesWithBasis),
    costBasisUsd: D(row.costBasisUsd),
    referenceBasisUsd: D(row.referenceBasisUsd),
    feeUsd: D(row.feeUsd),
    avgUnitCostUsd: D(row.avgUnitCostUsd),
    estimatedCostUsd: D(row.estimatedCostUsd),
    estimateSource: mainSource.get(row.instrumentId)?.source ?? null,
    wrappers: wrappers
      .filter((w) => w.instrumentId === row.instrumentId)
      .map((w) => ({ mint: w.mint, symbol: w.symbol, issuer: w.issuer, decimals: w.decimals })),
  }));
}

/**
 * The account's hourly readings since `from`, oldest first.
 *
 * A month is 720 rows at most, so the range is bounded by the query rather
 * than by a limit: a cap would silently drop the oldest end of the line, which
 * is the end a chart is for.
 */
/**
 * What this account last owed, from the newest reading there is.
 *
 * Read only when Kamino cannot be reached — which is exactly when nobody is
 * watching a loan — so an hour-old figure is served in place of a zero that
 * would make a borrower look solvent.
 */
export async function readLatestDebt(db: Db, owner: WalletOwner): Promise<Decimal | null> {
  const [row] = await db
    .select({ debtUsd: portfolioSnapshots.debtUsd })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, owner.userId), eq(portfolioSnapshots.walletId, owner.walletId)))
    .orderBy(desc(portfolioSnapshots.capturedAt))
    .limit(1);
  return row === undefined ? null : D(row.debtUsd);
}

/** The Earn balance in the latest reading. Null with no reading, or one from before Earn. */
export async function readLatestEarn(db: Db, owner: WalletOwner): Promise<Decimal | null> {
  const [row] = await db
    .select({ earnUsd: portfolioSnapshots.earnUsd })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, owner.userId), eq(portfolioSnapshots.walletId, owner.walletId)))
    .orderBy(desc(portfolioSnapshots.capturedAt))
    .limit(1);
  return row?.earnUsd == null ? null : D(row.earnUsd);
}

export async function readSnapshots(
  db: Db,
  userId: string,
  /** The wallets to add up, hour by hour. One for a wallet's own chart. */
  walletIds: readonly string[],
  from: Date,
): Promise<readonly Reading[]> {
  if (walletIds.length === 0) return [];
  /*
   * Summed by the hour, and an hour is drawn only when every wallet has a
   * reading for it. A wallet linked yesterday has none before yesterday, and
   * one missed hour is a gap in one wallet's line; adding up whatever was
   * there would draw either as money arriving or leaving, which it did not.
   * One wallet is the same query, every hour having its one reading.
   */
  const rows = await db
    .select({
      at: portfolioSnapshots.capturedAt,
      readAt: max(portfolioSnapshots.readAt),
      totalUsd: sum(portfolioSnapshots.totalUsd),
    })
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.userId, userId),
        inArray(portfolioSnapshots.walletId, [...walletIds]),
        gte(portfolioSnapshots.capturedAt, from),
      ),
    )
    .groupBy(portfolioSnapshots.capturedAt)
    .having(eq(count(), walletIds.length))
    .orderBy(asc(portfolioSnapshots.capturedAt));
  return rows.map((r) => ({
    at: r.at,
    readAt: r.readAt,
    totalUsd: D(r.totalUsd ?? "0"),
  }));
}

/*
 * Cash that crossed the account's edge, signed. Only USDC rows: they carry an
 * exact dollar amount, and only USDC is in the cash `totalUsd` counts. A SOL
 * transfer has no dollar figure and is not in the total either.
 *
 * In: a deposit. Out: a send. Trades, loans and repayments never reach these
 * kinds: `movementsIn` gives them rows of their own.
 *
 * Basket funding and exit are internal, because the total counts wallet and
 * basket value alike — and they are excluded by the portfolio on the row
 * rather than by the kind. The kind alone was not enough: the wallet-events
 * job writes basket funding as a plain `transfer_out` until the funding
 * confirmation re-kinds it, so a -$500 flow stood against an unchanged total
 * and printed +$500 of performance, permanently for a funding nobody ever
 * confirmed. `movementsIn` now stamps the portfolio when it writes the row.
 */
const FLOW_SIGN: Record<string, 1 | -1> = {
  transfer_in: 1,
  transfer_out: -1,
};

export async function readFlows(
  db: Db,
  userId: string,
  /**
   * The wallets whose edge is measured. Across several, a move from one to
   * another is a row out of one and a row into the other, which add to
   * nothing, as a move inside the account should.
   */
  walletIds: readonly string[],
  from: Date,
): Promise<readonly Flow[]> {
  if (walletIds.length === 0) return [];
  const rows = await db
    .select({ at: activities.occurredAt, kind: activities.kind, amountUsd: activities.amountUsd })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        inArray(activities.walletId, [...walletIds]),
        gte(activities.occurredAt, from),
        eq(activities.mint, USDC_MINT),
        inArray(activities.kind, Object.keys(FLOW_SIGN)),
        isNull(activities.basketPortfolioId),
        isNotNull(activities.amountUsd),
      ),
    );
  return rows.map((r) => ({ at: r.at, usd: D(r.amountUsd ?? "0").mul(FLOW_SIGN[r.kind] ?? 0) }));
}

/**
 * Which way a basket row moved the money, by kind.
 *
 * Both spellings of each direction, because a row is written by the
 * wallet-events job as a plain transfer and only re-kinded once the funding or
 * exit confirmation lands. A basis that recognised only the confirmed spelling
 * would miss every funding nobody confirmed.
 */
const BASKET_INWARD: Record<string, boolean> = {
  transfer_out: true,
  basket_funding: true,
  transfer_in: false,
  liquidate_to_usdc: false,
};

/**
 * Every dollar that crossed between this wallet and its own baskets, and
 * whether anything ever left one in kind.
 *
 * One query for both: an in-kind withdrawal is a row in the same table, it
 * just carries tokens instead of an amount, and it is what makes a basket's
 * basis incomplete.
 */
export async function readBasketMovements(
  db: Db,
  owner: WalletOwner,
): Promise<{ movements: readonly BasketMovement[]; inKindExits: readonly InKindExit[] }> {
  const rows = await db
    .select({
      kind: activities.kind,
      amountUsd: activities.amountUsd,
      portfolioId: activities.basketPortfolioId,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, owner.userId),
        eq(activities.walletId, owner.walletId),
        isNotNull(activities.basketPortfolioId),
      ),
    );

  const movements: BasketMovement[] = [];
  const inKindExits: InKindExit[] = [];
  for (const row of rows) {
    const portfolioId = row.portfolioId!;
    if (row.kind === "withdraw_in_kind") {
      inKindExits.push({ portfolioId });
      continue;
    }
    const inward = BASKET_INWARD[row.kind];
    if (inward === undefined || row.amountUsd === null) continue;
    movements.push({ portfolioId, amountUsd: D(row.amountUsd), inward });
  }
  return { movements, inKindExits };
}
