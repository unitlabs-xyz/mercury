import { and, asc, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { activities, instruments, portfolioSnapshots, positions, tokens } from "../db/schema.js";
import { USDC_MINT } from "@mercury/chain";
import type { HoldingRow } from "../routes/portfolio.js";
import type { Flow, Reading } from "./history.js";
import type { BasketMovement, InKindExit } from "./basket-basis.js";

/**
 * Every instrument the user has a position row for, with the wrappers that
 * belong to it. One query plus one, rather than a join that would repeat the
 * position across its wrappers and have to be folded back up.
 */
export async function readHoldings(db: Db, userId: string): Promise<readonly HoldingRow[]> {
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
    })
    .from(positions)
    .innerJoin(instruments, eq(instruments.id, positions.instrumentId))
    .where(eq(positions.userId, userId));

  if (rows.length === 0) return [];

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
export async function readLatestDebt(db: Db, userId: string): Promise<Decimal | null> {
  const [row] = await db
    .select({ debtUsd: portfolioSnapshots.debtUsd })
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .orderBy(desc(portfolioSnapshots.capturedAt))
    .limit(1);
  return row === undefined ? null : D(row.debtUsd);
}

export async function readSnapshots(db: Db, userId: string, from: Date): Promise<readonly Reading[]> {
  const rows = await db
    .select({
      at: portfolioSnapshots.capturedAt,
      totalUsd: portfolioSnapshots.totalUsd,
    })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.capturedAt, from)))
    .orderBy(asc(portfolioSnapshots.capturedAt));
  return rows.map((r) => ({
    at: r.at,
    totalUsd: D(r.totalUsd),
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

export async function readFlows(db: Db, userId: string, from: Date): Promise<readonly Flow[]> {
  const rows = await db
    .select({ at: activities.occurredAt, kind: activities.kind, amountUsd: activities.amountUsd })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
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
  userId: string,
): Promise<{ movements: readonly BasketMovement[]; inKindExits: readonly InKindExit[] }> {
  const rows = await db
    .select({
      kind: activities.kind,
      amountUsd: activities.amountUsd,
      portfolioId: activities.basketPortfolioId,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), isNotNull(activities.basketPortfolioId)));

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
