import { useMemo } from "react";
import type { Portfolio } from "@mercury/types";
import type { Borrow } from "../../api/borrow";
import type { Dashboard } from "../../api/dashboard";
import type { CreditMarket, Instrument } from "../../market/hooks";

export type Row = Portfolio["holdings"][number] & {
  readonly value: number;
  readonly weight: number;
  readonly returnUsd: number;
  readonly returnPct: number;
  readonly ltv: number;
  /** At the 80% safety target: value × LTV × 0.8. */
  readonly borrowable: number;
  readonly logo: string | undefined;
  readonly sector: string;
};

export type Model = {
  readonly total: number;
  readonly stocks: number;
  readonly cash: number;
  readonly changeUsd: number;
  readonly changePct: number;
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
    const stocks = total - cash;
    // Kamino's live terms from our API first; its public rates list if that is not in yet.
    const target = borrow?.safetyTarget ?? 0.8;
    const ltvOf = (ticker: string) =>
      borrow?.collateral.find((c) => c.isStock && c.ticker === ticker)?.ltv ??
      dash?.ltv?.[ticker] ??
      credit?.collateral.find((c) => c.ticker === ticker)?.maxLtv ??
      0;

    const rows: Row[] = p.holdings.map((h) => {
      const value = Number(h.valueUsd);
      const cost = Number(h.costBasisUsd);
      const inst = universe?.find((i) => i.ticker === h.ticker);
      const ltv = ltvOf(h.ticker);
      return {
        ...h,
        value,
        weight: total > 0 ? value / total : 0,
        returnUsd: value - cost,
        returnPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
        ltv,
        borrowable: value * ltv * target,
        logo: inst?.logo,
        sector: inst?.sector ?? "Other",
      };
    });

    const costBasis = rows.reduce((s, r) => s + Number(r.costBasisUsd), 0);
    const returnUsd = stocks - costBasis;

    // Value, and value an instant before today's move, so the sector's move is weighted by what is held.
    const bySector = new Map<string, { value: number; opening: number }>();
    for (const r of rows) {
      const acc = bySector.get(r.sector) ?? { value: 0, opening: 0 };
      acc.value += r.value;
      acc.opening += r.value / (1 + Number(r.changePct24h) / 100);
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

    const borrowed = borrow?.debtUsd ?? 0;
    const available = borrow?.borrowableUsd ?? rows.reduce((s, r) => s + r.borrowable, 0);
    const power = available + borrowed;
    const pledged = borrow?.collateralUsd ?? 0;
    const across = (f: (c: Borrow["collateral"][number]) => number) =>
      pledged > 0 ? (borrow?.collateral ?? []).reduce((s, c) => s + c.depositedUsd * f(c), 0) / pledged : 0;
    const byToday = [...rows].sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));

    return {
      total,
      stocks,
      cash,
      changeUsd: Number(p.changeUsd),
      changePct: Number(p.changePct),
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
