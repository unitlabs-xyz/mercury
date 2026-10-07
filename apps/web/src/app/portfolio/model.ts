import { useMemo } from "react";
import type { Portfolio } from "@mercury/types";
import { USDC_ASSET_ID } from "@mercury/view";
import type { Borrow } from "../../api/borrow";
import type { Dashboard } from "../../api/dashboard";
import type { CreditMarket, Instrument } from "../../market/hooks";

export type Row = {
  readonly ticker: string;
  readonly name: string;
  readonly shares: number;
  readonly pledgedShares: number;
  readonly wrapperCount: number;
  readonly changePct24h: number | null;
  readonly costBasisUsd: number;
  readonly walletValue: number;
  readonly basketValue: number;
  readonly value: number;
  readonly weight: number;
  readonly returnUsd: number;
  readonly returnPct: number | null;
  readonly ltv: number;
  /** At the 80% safety target: value × LTV × 0.8. */
  readonly borrowable: number;
  readonly logo: string | undefined;
  readonly sector: string;
};

export type Model = {
  /** Net worth including owned Glider smart accounts. */
  readonly total: number;
  /** Wallet and pledged stocks, wallet cash, and baskets, before the loan. */
  readonly assets: number;
  /** Wallet and pledged stocks plus stocks held in baskets. */
  readonly stocks: number;
  /** USDC held in Glider smart accounts; not wallet cash or spending power. */
  readonly basketCashUsd: number;
  /** In-transit value and basket assets not represented by stock or USDC rows. */
  readonly basketOtherUsd: number;
  readonly cash: number;
  /** Owed to Kamino, from the portfolio itself so it always agrees with `total`. */
  readonly debt: number;
  /** True when Kamino could not be read and `debt` is the last hour recorded. */
  readonly debtIsStale: boolean;
  /** Estimated rolling 24-hour price move on current wallet, pledged, and basket stocks. */
  readonly stockMove24hUsd: number | null;
  /** Relative to the estimated previous value of those stocks, not net worth. */
  readonly stockMove24hPct: number | null;
  readonly costBasis: number;
  readonly returnUsd: number;
  readonly returnPct: number;
  readonly rows: readonly Row[];
  readonly sectors: readonly { name: string; value: number; share: number; changePct: number }[];
  /** Debt plus what could still be borrowed, at the safety target. */
  readonly power: number;
  readonly borrowed: number;
  /** Still borrowable at the safety target, pledged stock and stock in the wallet together. */
  readonly available: number;
  /** Cash plus `available`: what could be spent today. */
  readonly spendable: number;
  /** Borrowed over pledged collateral, 0–1. */
  readonly ltvNow: number;
  /** The safety target as a share of pledged collateral: where borrowing stops. */
  readonly ltvMax: number;
  /** Where Kamino starts liquidating, as a share of pledged collateral. */
  readonly ltvLiquidation: number;
  /** The fall in collateral value that would reach liquidation. Null with no loan. */
  readonly safeUntilDrop: number | null;
  /** Debt above the safety target, after a fall. What to repay to get back inside it. */
  readonly overTarget: number;
  /** healthy, over_limit, margin_call or liquidation: see the server's capacity maths. */
  readonly health: Borrow["health"];
  readonly dropToMarginCall: number | null;
  readonly borrowApy: number;
  readonly best: Row | undefined;
  readonly worst: Row | undefined;
};

/**
 * Everything the dashboard shows, derived once from the portfolio, the
 * instrument list, the LTVs and the loan, so no two panels can disagree.
 */
export const useModel = (
  p: Portfolio | undefined,
  universe: readonly Instrument[] | undefined,
  credit: CreditMarket | undefined,
  dash: Dashboard | undefined,
  borrow?: Borrow | undefined,
): Model | undefined =>
  useMemo(() => {
    if (!p) return undefined;
    const total = Number(p.totalValueUsd);
    const cash = Number(p.cashUsd);
    const basketUsd = Number(p.basketUsd);
    const debt = Number(p.debtUsd);
    // Value each location separately. Backing stocks out of net worth would
    // subtract debt, and adding basket stocks again to `assets` would double-count them.
    const walletStocks = p.holdings.reduce((s, h) => s + Number(h.valueUsd), 0);
    const basketStocks = new Map<string, number>();
    let basketCashUsd = 0;
    for (const basket of p.baskets) {
      for (const holding of basket.holdings) {
        if (holding.assetId === USDC_ASSET_ID) {
          basketCashUsd += Number(holding.valueUsd);
          continue;
        }
        if (!holding.ticker) continue;
        basketStocks.set(holding.ticker, (basketStocks.get(holding.ticker) ?? 0) + Number(holding.valueUsd));
      }
    }
    const basketStockUsd = [...basketStocks.values()].reduce((sum, value) => sum + value, 0);
    const stocks = walletStocks + basketStockUsd;
    const basketOtherUsd = Math.max(0, basketUsd - basketStockUsd - basketCashUsd);
    // Weights are shares of what is held, not of what is owned outright: a
    // levered account would otherwise show holdings adding up to well past 100%.
    const assets = walletStocks + cash + basketUsd;
    // Kamino's live terms from our API first; its public rates list if that is not in yet.
    const target = borrow?.safetyTarget ?? 0.8;
    const ltvOf = (ticker: string) =>
      borrow?.collateral.find((c) => c.isStock && c.ticker === ticker)?.ltv ??
      dash?.ltv?.[ticker] ??
      credit?.collateral.find((c) => c.ticker === ticker)?.maxLtv ??
      0;

    const walletHoldings = new Map(p.holdings.map((holding) => [holding.ticker, holding]));
    const instruments = new Map(universe?.map((instrument) => [instrument.ticker, instrument]));
    const rows: Row[] = [...new Set([...walletHoldings.keys(), ...basketStocks.keys()])]
      .map((ticker) => {
        const holding = walletHoldings.get(ticker);
        const inst = instruments.get(ticker);
        const walletValue = Number(holding?.valueUsd ?? 0);
        const basketValue = basketStocks.get(ticker) ?? 0;
        const value = walletValue + basketValue;
        const cost = Number(holding?.costBasisUsd ?? 0);
        const returnUsd = Number(holding?.unrealisedPnlUsd ?? 0);
        const ltv = ltvOf(ticker);
        return {
          ticker,
          name: holding?.name ?? inst?.name ?? ticker,
          shares: Number(holding?.shares ?? 0),
          pledgedShares: Number(holding?.pledgedShares ?? 0),
          wrapperCount: holding?.wrapperCount ?? 1,
          changePct24h: holding ? Number(holding.changePct24h) : (inst?.quote.todayPct ?? null),
          costBasisUsd: cost,
          walletValue,
          basketValue,
          value,
          weight: assets > 0 ? value / assets : 0,
          returnUsd,
          returnPct: cost > 0 ? (returnUsd / cost) * 100 : null,
          ltv,
          borrowable: walletValue * ltv * target,
          logo: inst?.logo,
          sector: inst?.sector ?? "Other",
        };
      })
      .sort((a, b) => b.value - a.value);

    // The API computes the same estimate for every client from the token quotes it already reads.
    const stockMove24hUsd = stocks > 0 ? Number(p.changeUsd) : null;
    const stockMove24hPct = stocks > 0 ? Number(p.changePct) : null;

    const costBasis = rows.reduce((s, r) => s + r.costBasisUsd, 0);
    const returnUsd = rows.reduce((sum, row) => sum + row.returnUsd, 0);

    // Value, and value an instant before today's move, so the sector's move is weighted by what is held.
    const bySector = new Map<string, { value: number; opening: number }>();
    for (const r of rows) {
      const acc = bySector.get(r.sector) ?? { value: 0, opening: 0 };
      acc.value += r.value;
      acc.opening += r.value / (1 + (r.changePct24h ?? 0) / 100);
      bySector.set(r.sector, acc);
    }
    const sectors = [...bySector]
      .map(([name, { value, opening }]) => ({
        name,
        value,
        share: stocks > 0 ? value / stocks : 0,
        changePct: opening > 0 ? ((value - opening) / opening) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // The portfolio's own figure first: it is the one `total` was computed from,
    // and a panel disagreeing with the headline above it is the bug this file exists to stop.
    const borrowed = debt || (borrow?.debtUsd ?? 0);
    const available = borrow?.borrowableUsd ?? rows.reduce((s, r) => s + r.borrowable, 0);
    const power = available + borrowed;
    const pledged = borrow?.collateralUsd ?? 0;
    const across = (f: (c: Borrow["collateral"][number]) => number) =>
      pledged > 0 ? (borrow?.collateral ?? []).reduce((s, c) => s + c.depositedUsd * f(c), 0) / pledged : 0;
    const byToday = [...rows].sort((a, b) => (b.changePct24h ?? 0) - (a.changePct24h ?? 0));

    return {
      total,
      assets,
      stocks,
      basketCashUsd,
      basketOtherUsd,
      cash,
      debt,
      debtIsStale: p.debtIsStale,
      stockMove24hUsd,
      stockMove24hPct,
      costBasis,
      returnUsd,
      returnPct: costBasis > 0 ? (returnUsd / costBasis) * 100 : 0,
      rows,
      sectors,
      power,
      borrowed,
      available,
      spendable: borrow?.spendableUsd ?? cash + available,
      ltvNow: borrow?.ltv ?? 0,
      ltvMax: across((c) => c.ltv * target),
      ltvLiquidation: across((c) => c.liquidationThreshold),
      safeUntilDrop: borrow?.safeUntilDrop ?? null,
      overTarget: borrow?.overTargetUsd ?? 0,
      health: borrow?.health ?? "healthy",
      dropToMarginCall: borrow?.dropToMarginCall ?? null,
      borrowApy: borrow?.borrowApy ?? 0,
      best: byToday[0],
      worst: byToday.length > 1 ? byToday[byToday.length - 1] : undefined,
    };
  }, [p, universe, credit, dash, borrow]);
