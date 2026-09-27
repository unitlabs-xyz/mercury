import { D, ONE, ZERO, type Decimal } from "@mercury/core";
import type { CollateralTerms, LendingPosition, LendingTerms } from "./ports.js";

/**
 * We lend to 80% of Kamino's own limit, never to it. At Kamino's maximum a
 * SPYx loan (73% LTV, liquidated at 75%) is wiped out by a 2.7% dip; at 80% of
 * it the same loan survives a 22% fall. The target is enforced when a borrow or
 * withdrawal is built, not just shown.
 */
export const SAFETY_TARGET = D("0.8");

/**
 * Our maintenance level: a margin call at 85% of the way to Kamino's
 * liquidation line. Kamino sells at 100%; we lock the loan and ask for a repay
 * well before, so there is still roughly a 15% fall between our alarm and a
 * sale. For SPY that is a margin call at 63.75% LTV against Kamino's 75%.
 */
export const MARGIN_CALL_USAGE = D("0.85");

/**
 * Where a loan stands, from our side of Kamino's line:
 *  - healthy: inside the 80% borrow limit. Everything is open.
 *  - over_limit: a fall has pushed it past the limit. Borrowing more and
 *    withdrawing collateral are locked until a repay (or more collateral)
 *    brings it back inside.
 *  - margin_call: 85% of the way to liquidation. Still locked, and urgent.
 *  - liquidation: at Kamino's line. Kamino is selling collateral now.
 */
export type Health = "healthy" | "over_limit" | "margin_call" | "liquidation";

const min = (...xs: Decimal[]) => xs.reduce((a, b) => (b.lt(a) ? b : a));
const max0 = (x: Decimal) => (x.isNegative() ? ZERO : x);

export interface CollateralRow {
  readonly ticker: string;
  readonly isStock: boolean;
  readonly decimals: number;
  readonly ltv: Decimal;
  readonly liquidationThreshold: Decimal;
  readonly pricePerToken: Decimal;
  /** Already pledged to Kamino. */
  readonly depositedTokens: Decimal;
  readonly depositedUsd: Decimal;
  /** In the wallet and still free to pledge, within the reserve's deposit cap. */
  readonly depositableTokens: Decimal;
  readonly depositableUsd: Decimal;
  /** What this stock alone supports at the safety target, pledged or pledgeable. */
  readonly safeLimitUsd: Decimal;
  /**
   * What can be borrowed against this stock right now, if the wallet's free
   * tokens were pledged: its safe limit, less any debt the other collateral does
   * not already cover, capped by what the USDC pool can lend.
   */
  readonly borrowableUsd: Decimal;
  /** At the safety target on this stock alone, the fall that would reach liquidation. */
  readonly cushionAtTarget: Decimal;
  /**
   * The price per token at which the loan would be liquidated if this stock fell
   * and everything else held still. Null when nothing of it is pledged, or when
   * the rest of the collateral covers the loan on its own.
   */
  readonly liquidationPrice: Decimal | null;
  /** How far the price is above that, 0–1: a 0.22 means a 22% fall reaches it. */
  readonly liquidationDistance: Decimal | null;
}

export interface BorrowSummary {
  readonly safetyTarget: Decimal;
  readonly cashUsd: Decimal;
  readonly collateralUsd: Decimal;
  readonly debtUsd: Decimal;
  /** Borrowable against what is already pledged, at the safety target. */
  readonly borrowableNowUsd: Decimal;
  /** Debt above the safety target on what is pledged: what to repay to get back inside it. */
  readonly overTargetUsd: Decimal;
  readonly health: Health;
  /** True unless healthy: borrowing more and withdrawing collateral are refused. */
  readonly locked: boolean;
  /** Debt over the value where Kamino liquidates, 0–1. The margin call is at 0.85. */
  readonly usage: Decimal | null;
  /** The smallest repay that ends a margin call. Zero outside one. */
  readonly repayToClearMarginCallUsd: Decimal;
  /** The fall in collateral value that would start a margin call. Null with no loan or already in one. */
  readonly dropToMarginCall: Decimal | null;
  /** Borrowable if every accepted stock in the wallet were pledged too. */
  readonly borrowableUsd: Decimal;
  /** Cash plus what could be borrowed: what the card could spend today. */
  readonly spendableUsd: Decimal;
  /** Debt over pledged value, 0–1. */
  readonly ltv: Decimal;
  /** Debt over the value where liquidation starts, 0–1. */
  readonly liquidationLtv: Decimal | null;
  /** The fall in collateral value that would start liquidation. Null with no debt. */
  readonly safeUntilDrop: Decimal | null;
  readonly poolAvailableUsd: Decimal;
  readonly borrowApy: Decimal;
  readonly rows: readonly CollateralRow[];
}

export interface CapacityInput {
  readonly terms: LendingTerms;
  readonly position: LendingPosition | null;
  /** Raw token balances in the wallet by mint, not counting what is pledged. */
  readonly wallet: ReadonlyMap<string, bigint>;
  readonly cashUsd: Decimal;
}

/** What the USDC pool can still lend, under both its liquidity and its borrow cap. */
const poolRoom = (t: LendingTerms) =>
  max0(min(t.pool.availableUsd, t.pool.borrowCapUsd.sub(t.pool.borrowedUsd)));

const capRoom = (c: CollateralTerms) =>
  c.depositCapTokens === null ? null : max0(c.depositCapTokens.sub(c.depositedTokens));

export function capacity(input: CapacityInput): BorrowSummary {
  const { terms, position, wallet } = input;
  const pool = poolRoom(terms);
  const bf = terms.pool.borrowFactor.isZero() ? ONE : terms.pool.borrowFactor;
  const debt = position?.debtUsd ?? ZERO;
  // Kamino weighs debt by the borrowed asset's factor; for USDC that is one.
  const weighted = position?.debtBfAdjustedUsd ?? debt.mul(bf);

  const base = terms.collateral.map((c) => {
    const pledged = position?.deposits.find((d) => d.ticker === c.ticker);
    const depositedTokens = pledged?.tokens ?? ZERO;
    const depositedUsd = pledged?.valueUsd ?? ZERO;
    const raw = wallet.get(c.mint) ?? 0n;
    const inWallet = D(raw.toString()).div(D(10).pow(c.decimals));
    const room = capRoom(c);
    // Only stocks are offered for pledging. Other collateral counts once pledged, but a
    // wallet's USDC is its cash: counting it as pledgeable would count it twice in spendable.
    const depositableTokens = !c.isStock ? ZERO : room === null ? inWallet : min(inWallet, room);
    const depositableUsd = depositableTokens.mul(c.pricePerToken);
    return { c, depositedTokens, depositedUsd, depositableTokens, depositableUsd };
  });

  const safeOf = (usd: Decimal, c: CollateralTerms) => usd.mul(c.ltv).mul(SAFETY_TARGET).div(bf);
  const safePledged = base.reduce((s, b) => s.add(safeOf(b.depositedUsd, b.c)), ZERO);
  const safeAll = base.reduce((s, b) => s.add(safeOf(b.depositedUsd.add(b.depositableUsd), b.c)), ZERO);

  // Kamino liquidates when weighted debt reaches Σ pledged value × liquidation threshold.
  const unhealthyAt = base.reduce((s, b) => s.add(b.depositedUsd.mul(b.c.liquidationThreshold)), ZERO);

  const rows: CollateralRow[] = base.map((b) => {
    // Hold everything else still and solve for the price at which this stock alone tips the loan.
    const restUnhealthy = unhealthyAt.sub(b.depositedUsd.mul(b.c.liquidationThreshold));
    const need = weighted.sub(restUnhealthy);
    const liquidationPrice =
      weighted.isZero() || b.depositedTokens.isZero() || need.lte(0)
        ? null
        : need.div(b.depositedTokens.mul(b.c.liquidationThreshold));
    const liquidationDistance =
      liquidationPrice === null || b.c.pricePerToken.isZero()
        ? null
        : max0(ONE.sub(liquidationPrice.div(b.c.pricePerToken)));
    const own = safeOf(b.depositedUsd.add(b.depositableUsd), b.c);
    // Debt is covered by the other pledged collateral first; only what is left eats into this stock.
    const others = safePledged.sub(safeOf(b.depositedUsd, b.c));
    const uncovered = max0(weighted.sub(others));
    return {
      ticker: b.c.ticker,
      isStock: b.c.isStock,
      decimals: b.c.decimals,
      ltv: b.c.ltv,
      liquidationThreshold: b.c.liquidationThreshold,
      pricePerToken: b.c.pricePerToken,
      depositedTokens: b.depositedTokens,
      depositedUsd: b.depositedUsd,
      depositableTokens: b.depositableTokens,
      depositableUsd: b.depositableUsd,
      safeLimitUsd: own,
      borrowableUsd: min(max0(own.sub(uncovered)), pool),
      cushionAtTarget: ONE.sub(b.c.ltv.mul(SAFETY_TARGET).div(b.c.liquidationThreshold)),
      liquidationPrice,
      liquidationDistance,
    };
  });

  const collateralUsd = base.reduce((s, b) => s.add(b.depositedUsd), ZERO);
  const liquidationAt = position?.liquidationBorrowUsd ?? ZERO;
  const borrowableUsd = min(max0(safeAll.sub(weighted)), pool);
  const overTargetUsd = max0(weighted.sub(safePledged));
  const usage = weighted.isZero() || liquidationAt.isZero() ? null : weighted.div(liquidationAt);
  const health: Health =
    usage === null
      ? "healthy"
      : usage.gte(ONE)
        ? "liquidation"
        : usage.gte(MARGIN_CALL_USAGE)
          ? "margin_call"
          : overTargetUsd.gt("0.01")
            ? "over_limit"
            : "healthy";

  return {
    safetyTarget: SAFETY_TARGET,
    cashUsd: input.cashUsd,
    collateralUsd,
    debtUsd: debt,
    borrowableNowUsd: min(max0(safePledged.sub(weighted)), pool),
    overTargetUsd,
    health,
    locked: health !== "healthy",
    usage,
    repayToClearMarginCallUsd:
      usage === null ? ZERO : max0(weighted.sub(liquidationAt.mul(MARGIN_CALL_USAGE))),
    dropToMarginCall:
      usage === null || usage.gte(MARGIN_CALL_USAGE) ? null : ONE.sub(usage.div(MARGIN_CALL_USAGE)),
    borrowableUsd,
    spendableUsd: input.cashUsd.add(borrowableUsd),
    ltv: collateralUsd.isZero() ? ZERO : weighted.div(collateralUsd),
    liquidationLtv: liquidationAt.isZero() ? null : weighted.div(liquidationAt),
    safeUntilDrop:
      weighted.isZero() || liquidationAt.isZero() ? null : max0(ONE.sub(weighted.div(liquidationAt))),
    poolAvailableUsd: pool,
    borrowApy: terms.pool.borrowApy,
    rows,
  };
}

/**
 * The safe borrowing limit after an optional change to one stock's pledged
 * tokens, before debt and before the pool's cap. The build path checks every
 * borrow and withdrawal against it, so nothing past the safety target is ever
 * handed to the wallet to sign.
 */
export function safeLimitAfter(
  input: CapacityInput,
  change: { readonly ticker?: string; readonly tokensDelta?: Decimal } = {},
): Decimal {
  const { terms, position } = input;
  const bf = terms.pool.borrowFactor.isZero() ? ONE : terms.pool.borrowFactor;
  return terms.collateral.reduce((s, c) => {
    const pledged = position?.deposits.find((d) => d.ticker === c.ticker)?.tokens ?? ZERO;
    const tokens = c.ticker === change.ticker ? max0(pledged.add(change.tokensDelta ?? ZERO)) : pledged;
    return s.add(tokens.mul(c.pricePerToken).mul(c.ltv).mul(SAFETY_TARGET).div(bf));
  }, ZERO);
}

/** What may still be borrowed after the change: the safe limit less debt, within the pool. */
export function safeHeadroomAfter(
  input: CapacityInput,
  change: { readonly ticker?: string; readonly tokensDelta?: Decimal } = {},
): Decimal {
  const weighted = input.position?.debtBfAdjustedUsd ?? ZERO;
  return min(max0(safeLimitAfter(input, change).sub(weighted)), poolRoom(input.terms));
}
