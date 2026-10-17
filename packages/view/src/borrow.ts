/**
 * Borrowing against stocks: the position as both clients read it, and what one
 * action would do to it.
 *
 * Lifted out of the web's borrow sheet when the phone gained the same actions.
 * This is the code that decides how many tokens a borrow pledges, when a repay
 * is "all", and how much collateral can come back without crossing the safety
 * target — the arithmetic that moves money. Two copies of it would be two
 * answers to how much somebody can borrow.
 */
import { usd } from "./format.js";

/** One collateral line from GET /v1/borrow. Money as numbers: these are display figures. */
export type BorrowRow = {
  readonly ticker: string;
  readonly isStock: boolean;
  readonly decimals: number;
  readonly ltv: number;
  readonly liquidationThreshold: number;
  readonly pricePerToken: number;
  readonly depositedTokens: number;
  readonly depositedUsd: number;
  readonly depositableTokens: number;
  readonly depositableUsd: number;
  /** This stock alone at the safety target, pledged or pledgeable. */
  readonly safeLimitUsd: number;
  /** What can be borrowed against it right now, within the pool. */
  readonly borrowableUsd: number;
  /** At the target on this stock alone, the fall that would reach liquidation. */
  readonly cushionAtTarget: number;
  /** The price per token at which Kamino would liquidate, everything else held still. */
  readonly liquidationPrice: number | null;
  /** How far today's price is above it, 0–1. */
  readonly liquidationDistance: number | null;
};

/**
 * Where a loan stands. Healthy is inside the 80% limit; over_limit and
 * margin_call lock borrowing and withdrawals until a repay; liquidation means
 * Kamino is selling.
 */
export type Health = "healthy" | "over_limit" | "margin_call" | "liquidation";

export type Borrow = {
  readonly safetyTarget: number;
  readonly cashUsd: number;
  readonly collateralUsd: number;
  readonly debtUsd: number;
  readonly borrowableNowUsd: number;
  readonly overTargetUsd: number;
  readonly health: Health;
  readonly locked: boolean;
  /** Debt over the point Kamino liquidates, 0–1. The margin call is at 0.85. */
  readonly usage: number | null;
  readonly repayToClearMarginCallUsd: number;
  /** The fall that would start a margin call. */
  readonly dropToMarginCall: number | null;
  readonly borrowableUsd: number;
  /** Cash plus what could be borrowed. */
  readonly spendableUsd: number;
  readonly ltv: number;
  readonly liquidationLtv: number | null;
  readonly safeUntilDrop: number | null;
  readonly poolAvailableUsd: number;
  readonly borrowApy: number;
  readonly obligation: string | null;
  /**
   * What opening the Kamino account costs, which Mercury pays: shown struck
   * through on a first borrow. Null once the account is open, or when the
   * server could not price it.
   */
  readonly setupCostUsd: number | null;
  /**
   * What is owed in USDC, interest included: what a repay of everything sends.
   * `debtUsd` is the same debt at Kamino's USDC price, a hair under a dollar.
   */
  readonly owedUsdc: number;
  /** What was lent and not yet repaid. Null when the ledger cannot account for the debt. */
  readonly principalUsdc: number | null;
  /** What is owed beyond what was lent. Null alongside the principal. */
  readonly interestUsdc: number | null;
  /** What the wallet must hold to repay all of it: what is owed and an hour of interest. */
  readonly closeLoanUsdc: number;
  /** The least Kamino lets a debt or a stock's collateral be left worth: $0.01. */
  readonly minPositionUsd: number;
  readonly collateral: readonly BorrowRow[];
};

/** GET /v1/borrow as it arrives: decimals as strings, so nothing is rounded on the wire. */
export type BorrowWire = Record<string, string | boolean | null> & {
  collateral: Record<string, string | number | boolean | null>[];
};

const n = (v: string | boolean | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const borrowFromWire = (w: BorrowWire): Borrow => ({
  safetyTarget: Number(w["safetyTarget"]),
  cashUsd: Number(w["cashUsd"]),
  collateralUsd: Number(w["collateralUsd"]),
  debtUsd: Number(w["debtUsd"]),
  borrowableNowUsd: Number(w["borrowableNowUsd"]),
  overTargetUsd: Number(w["overTargetUsd"]),
  health: (w["health"] ?? "healthy") as Health,
  locked: String(w["locked"]) === "true",
  usage: n(w["usage"]),
  repayToClearMarginCallUsd: Number(w["repayToClearMarginCallUsd"] ?? 0),
  dropToMarginCall: n(w["dropToMarginCall"]),
  borrowableUsd: Number(w["borrowableUsd"]),
  spendableUsd: Number(w["spendableUsd"]),
  ltv: Number(w["ltv"]),
  liquidationLtv: n(w["liquidationLtv"]),
  safeUntilDrop: n(w["safeUntilDrop"]),
  poolAvailableUsd: Number(w["poolAvailableUsd"]),
  borrowApy: Number(w["borrowApy"]),
  obligation: typeof w["obligation"] === "string" ? w["obligation"] : null,
  setupCostUsd: n(w["setupCostUsd"]),
  // A server from before these said only the debt, and asked 0.1% of it as headroom to close.
  owedUsdc: Number(w["owedUsdc"] ?? w["debtUsd"]),
  principalUsdc: n(w["principalUsdc"]),
  interestUsdc: n(w["interestUsdc"]),
  closeLoanUsdc: w["closeLoanUsdc"] === undefined ? Number(w["debtUsd"]) * 1.001 : Number(w["closeLoanUsdc"]),
  minPositionUsd: Number(w["minPositionUsd"] ?? 0.01),
  collateral: w.collateral.map((r) => ({
    ticker: String(r["ticker"]),
    isStock: r["isStock"] === true,
    decimals: Number(r["decimals"]),
    ltv: Number(r["ltv"]),
    liquidationThreshold: Number(r["liquidationThreshold"]),
    pricePerToken: Number(r["pricePerToken"]),
    depositedTokens: Number(r["depositedTokens"]),
    depositedUsd: Number(r["depositedUsd"]),
    depositableTokens: Number(r["depositableTokens"]),
    depositableUsd: Number(r["depositableUsd"]),
    safeLimitUsd: Number(r["safeLimitUsd"]),
    borrowableUsd: Number(r["borrowableUsd"]),
    cushionAtTarget: Number(r["cushionAtTarget"]),
    liquidationPrice: r["liquidationPrice"] === null ? null : Number(r["liquidationPrice"]),
    liquidationDistance: r["liquidationDistance"] === null ? null : Number(r["liquidationDistance"]),
  })),
});

/** The body of POST /v1/borrow/transactions. */
export type BorrowIntent =
  | { kind: "deposit_and_borrow"; ticker: string; tokensRaw: string; usd: string }
  | { kind: "deposit"; ticker: string; tokensRaw: string }
  | { kind: "borrow"; usd: string }
  | { kind: "repay"; usd: string | "all" }
  | { kind: "withdraw"; ticker: string; tokensRaw: string | "all" };

export type BorrowTab = "borrow" | "repay" | "pledge" | "withdraw";

/** A small cushion so a price tick between quote and signing does not push a borrow past the target. */
export const PRICE_BUFFER = 1.005;

/** Debt over the value at which liquidation starts, after a change. */
export const safeUntil = (b: Borrow, debt: number, deposits: (r: BorrowRow) => number) => {
  const liquidationAt = b.collateral.reduce(
    (s, r) => s + deposits(r) * r.pricePerToken * r.liquidationThreshold,
    0,
  );
  return debt <= 0 || liquidationAt <= 0 ? null : Math.max(0, 1 - debt / liquidationAt);
};

const safePledged = (b: Borrow, deposits: (r: BorrowRow) => number) =>
  b.collateral.reduce((s, r) => s + deposits(r) * r.pricePerToken * r.ltv * b.safetyTarget, 0);

/** Tokens to base units, as a string the server parses as a bigint. */
/**
 * Down to the cent, never up.
 *
 * The amount is sent as a two-decimal string and the server checks it against
 * a full-precision cap with no tolerance, so a limit of $0.5098 rounded to the
 * nearest cent asks for $0.51 — a penny more than it is allowed, and refused.
 * Rounding down can only ever ask for less than is permitted.
 */
export const floorCents = (usdValue: number) => Math.floor(usdValue * 100) / 100;

/**
 * Up to the cent, for a figure less than which would not be enough: what it
 * takes to close a loan. The nudge keeps a whole cent whole, because 2.12 × 100
 * is 212.00000000000003 in floating point and would otherwise round up to 2.13.
 */
export const ceilCents = (usdValue: number) => Math.ceil(usdValue * 100 - 1e-9) / 100;

/**
 * Kamino's price for a USDC, from its two figures for the debt, never above $1:
 * what its one-cent minimum is measured at. The server checks the same.
 */
const usdcPrice = (b: Borrow) => (b.owedUsdc > 0 ? Math.min(1, b.debtUsd / b.owedUsdc) : 1);

/**
 * Interest as the card says it. Minutes into a small loan it is a fraction of a
 * cent, and "$0.00" would say there is none; null is a debt the ledger cannot
 * split, so it says nothing rather than guess.
 */
export const interestText = (interest: number | null) =>
  interest === null ? "—" : interest > 0 && interest < 0.01 ? "Less than 1¢" : usd(interest);

/** Roughly a month of interest on what is owed now, at today's rate. */
export const monthlyInterestText = (b: Borrow) => {
  const month = (b.owedUsdc * b.borrowApy) / 12;
  return month < 0.01 ? "under 1¢ a month" : `about ${usd(month)} a month`;
};

/** Whether a position would be left worth more than nothing but less than Kamino's minimum. */
const leavesDust = (b: Borrow, worthUsd: number) => worthUsd > 1e-12 && worthUsd < b.minPositionUsd - 1e-12;

/** The same, for a token amount against the six decimals the field shows. */
export const floorTokens = (tokens: number) => Math.floor(tokens * 1e6) / 1e6;

export const tokensToRaw = (tokens: number, decimals: number, round: "up" | "down") => {
  const scaled = tokens * 10 ** decimals;
  return BigInt(round === "up" ? Math.ceil(scaled) : Math.floor(scaled)).toString();
};

/**
 * The most you can borrow choosing this stock: what is already open against
 * the collateral pledged today, plus what pledging this stock's free shares
 * adds, capped by the pool.
 */
export const borrowLimit = (b: Borrow, r: BorrowRow) =>
  Math.min(
    b.poolAvailableUsd,
    b.borrowableNowUsd + r.depositableTokens * r.pricePerToken * r.ltv * b.safetyTarget,
  );

/** The stocks each tab chooses between. */
export const borrowChoices = (b: Borrow | undefined, tab: BorrowTab): BorrowRow[] => {
  const stocks = (b?.collateral ?? []).filter((r) => r.isStock);
  if (tab === "withdraw") return stocks.filter((r) => r.depositedTokens > 0);
  if (tab === "pledge") return stocks.filter((r) => r.depositableTokens > 0);
  return stocks.filter((r) => r.depositedTokens > 0 || r.depositableTokens > 0);
};

/** The chosen stock, or the one that would let the most be borrowed. */
export const pickRow = (choices: readonly BorrowRow[], ticker: string | null | undefined) =>
  choices.find((r) => r.ticker === ticker) ??
  [...choices].sort((x, y) => y.borrowableUsd - x.borrowableUsd)[0];

export interface BorrowPlan {
  /** What to send, or null when there is nothing to act on. */
  readonly intent: BorrowIntent | null;
  /** The most this tab allows: dollars for borrow and repay, tokens for pledge and withdraw. */
  readonly max: number;
  readonly preview: {
    /** The debt after, at Kamino's prices: what the meter and the limits are measured in. */
    readonly debt: number;
    /** What will be owed after, in USDC: what "to repay in full" would then say. */
    readonly owed: number;
    readonly drop: number | null;
    readonly deposits: (r: BorrowRow) => number;
    readonly note?: string;
  } | null;
  /** Why it cannot go ahead, in the reader's words. */
  readonly blocked: string | null;
  /** Quick amounts under the field. */
  readonly presets: readonly { label: string; v: number }[];
  /** A loan past the limit is locked: only repaying and pledging more are open. */
  readonly paused: boolean;
  /** Pledge and withdraw are counted in tokens, the rest in dollars. */
  readonly inTokens: boolean;
}

/**
 * What one action would do. Everything offered is already inside the 80%
 * safety target, and the server checks it again before building anything, so
 * the limit here is a limit, not advice.
 */
export const planBorrow = (
  b: Borrow | undefined,
  tab: BorrowTab,
  row: BorrowRow | undefined,
  value: number,
): BorrowPlan => {
  let intent: BorrowIntent | null = null;
  let max = 0;
  let preview: BorrowPlan["preview"] = null;
  let blocked: string | null = null;

  if (b && tab === "borrow" && row) {
    const perToken = row.pricePerToken * row.ltv * b.safetyTarget;
    max = borrowLimit(b, row);
    const extra = Math.max(0, value - b.borrowableNowUsd);
    const tokens = extra > 0 ? Math.min(row.depositableTokens, (extra / perToken) * PRICE_BUFFER) : 0;
    intent =
      tokens > 0
        ? {
            kind: "deposit_and_borrow",
            ticker: row.ticker,
            tokensRaw: tokensToRaw(tokens, row.decimals, "up"),
            usd: floorCents(value).toFixed(2),
          }
        : { kind: "borrow", usd: floorCents(value).toFixed(2) };
    const after = (r: BorrowRow) => r.depositedTokens + (r.ticker === row.ticker ? tokens : 0);
    preview = {
      debt: b.debtUsd + value,
      owed: b.owedUsdc + value,
      drop: safeUntil(b, b.debtUsd + value, after),
      deposits: after,
      ...(tokens > 0
        ? { note: `Adds ${tokens.toFixed(4)} ${row.ticker}x as collateral on Kamino. The shares stay yours.` }
        : {}),
    };
    if (value > max + 0.005) blocked = `At most ${usd(max)} at the 80% safety target.`;
    else if (value > 0 && leavesDust(b, (b.owedUsdc + value) * usdcPrice(b)))
      blocked = `Borrow at least ${usd(b.minPositionUsd)}: Kamino does not lend less.`;
  } else if (b && tab === "repay") {
    /*
     * In USDC, interest included, and in whole loans: an amount that would
     * leave less than Kamino's minimum owing — the whole debt, or all but a
     * fraction of a cent of it — is a repay of everything, because Kamino
     * refuses to leave a debt that small. "All" is what is owed, rounded up to
     * the cent: the total of the rows under it. The wallet has to hold a little
     * more — an hour of interest, `closeLoanUsdc` — and only that check sees it.
     */
    const price = usdcPrice(b);
    const left = (b.owedUsdc - value) * price;
    const closing = b.owedUsdc > 0 && value > 0 && (left <= 1e-12 || leavesDust(b, left));
    max = ceilCents(b.owedUsdc);
    intent = { kind: "repay", usd: closing ? "all" : value.toFixed(2) };
    const debtAfter = closing ? 0 : Math.max(0, b.debtUsd - value * price);
    preview = {
      debt: debtAfter,
      owed: closing ? 0 : Math.max(0, b.owedUsdc - value),
      drop: safeUntil(b, debtAfter, (r) => r.depositedTokens),
      deposits: (r) => r.depositedTokens,
    };
    if (b.owedUsdc <= 0) blocked = "There is no loan to repay.";
    else if (closing && b.cashUsd < b.closeLoanUsdc) {
      const most = floorCents(b.owedUsdc - b.minPositionUsd / price);
      blocked =
        `Repaying all of it needs ${usd(ceilCents(b.closeLoanUsdc))} in the wallet. You have ${usd(floorCents(b.cashUsd))}: ` +
        `add ${usd(ceilCents(b.closeLoanUsdc - b.cashUsd))} of USDC` +
        (most > 0 ? `, or repay up to ${usd(most)}.` : ".");
    } else if (!closing && value > b.cashUsd) blocked = `Only ${usd(b.cashUsd)} of cash in the wallet.`;
  } else if (b && tab === "pledge" && row) {
    max = row.depositableTokens;
    intent = { kind: "deposit", ticker: row.ticker, tokensRaw: tokensToRaw(value, row.decimals, "down") };
    const after = (r: BorrowRow) => r.depositedTokens + (r.ticker === row.ticker ? value : 0);
    preview = {
      debt: b.debtUsd,
      owed: b.owedUsdc,
      drop: safeUntil(b, b.debtUsd, after),
      deposits: after,
      note: "Adds collateral without borrowing. The shares stay yours and can be withdrawn later.",
    };
    if (value > max + 1e-9) blocked = `Only ${max.toFixed(4)} ${row.ticker}x is free in the wallet.`;
    else if (value > 0 && leavesDust(b, (row.depositedTokens + value) * row.pricePerToken))
      blocked = `Add at least ${usd(b.minPositionUsd)} of ${row.ticker}x as collateral: Kamino does not take less.`;
  } else if (b && tab === "withdraw" && row) {
    const spare = safePledged(b, (r) => r.depositedTokens) - b.debtUsd;
    const perToken = row.pricePerToken * row.ltv * b.safetyTarget;
    max =
      b.debtUsd <= 0
        ? row.depositedTokens
        : Math.max(0, Math.min(row.depositedTokens, spare / perToken / PRICE_BUFFER));
    /*
     * Max offers what the six-decimal field can hold, which is a hair under the
     * true balance. With nothing owed that still means all of it, and only the
     * sentinel takes the dust with it.
     */
    const all = b.debtUsd <= 0 && value >= floorTokens(row.depositedTokens) - 1e-9;
    intent = {
      kind: "withdraw",
      ticker: row.ticker,
      tokensRaw: all ? "all" : tokensToRaw(value, row.decimals, "down"),
    };
    const after = (r: BorrowRow) => r.depositedTokens - (r.ticker === row.ticker ? value : 0);
    preview = { debt: b.debtUsd, owed: b.owedUsdc, drop: safeUntil(b, b.debtUsd, after), deposits: after };
    if (value > max + 1e-9)
      blocked =
        b.debtUsd > 0
          ? "Repay some of the loan first to take that much back."
          : `Only ${max.toFixed(4)} ${row.ticker}x is pledged.`;
    else if (!all && value > 0 && leavesDust(b, (row.depositedTokens - value) * row.pricePerToken))
      blocked = `That would leave less than ${usd(b.minPositionUsd)} of ${row.ticker}x pledged, which Kamino does not allow. Take all of it back, or leave more.`;
  }

  // Shares of the most for a borrow, pledge or withdrawal; the figures that
  // unlock something for a repay.
  const presets = !b
    ? []
    : tab === "repay"
      ? [
          ...(b.repayToClearMarginCallUsd > 0
            ? [{ label: "End margin call", v: b.repayToClearMarginCallUsd }]
            : []),
          ...(b.overTargetUsd > 0 ? [{ label: "Unlock", v: b.overTargetUsd }] : []),
          { label: "Half", v: max / 2 },
          { label: "All", v: max },
        ]
      : tab === "borrow"
        ? [
            { label: "25%", v: floorCents(max * 0.25) },
            { label: "50%", v: floorCents(max * 0.5) },
            { label: "75%", v: floorCents(max * 0.75) },
            { label: "Max", v: floorCents(max) },
          ]
        : [
            { label: "25%", v: floorTokens(max * 0.25) },
            { label: "50%", v: floorTokens(max * 0.5) },
            { label: "75%", v: floorTokens(max * 0.75) },
            { label: "Max", v: floorTokens(max) },
          ];

  return {
    intent,
    max,
    preview,
    blocked,
    presets,
    paused: !!b?.locked && (tab === "borrow" || tab === "withdraw"),
    inTokens: tab === "pledge" || tab === "withdraw",
  };
};
