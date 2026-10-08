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
    readonly debt: number;
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
      drop: safeUntil(b, b.debtUsd + value, after),
      deposits: after,
      ...(tokens > 0
        ? { note: `Pledges ${tokens.toFixed(4)} ${row.ticker}x to Kamino. The shares stay yours.` }
        : {}),
    };
    if (value > max + 0.005) blocked = `At most ${usd(max)} at the 80% safety target.`;
  } else if (b && tab === "repay") {
    max = Math.min(b.debtUsd, b.cashUsd);
    intent = {
      kind: "repay",
      usd: value >= b.debtUsd - 0.005 && b.cashUsd >= b.debtUsd * 1.001 ? "all" : value.toFixed(2),
    };
    preview = {
      debt: Math.max(0, b.debtUsd - value),
      drop: safeUntil(b, Math.max(0, b.debtUsd - value), (r) => r.depositedTokens),
      deposits: (r) => r.depositedTokens,
    };
    if (b.debtUsd <= 0) blocked = "There is no loan to repay.";
    else if (value > b.cashUsd) blocked = `Only ${usd(b.cashUsd)} of cash in the wallet.`;
  } else if (b && tab === "pledge" && row) {
    max = row.depositableTokens;
    intent = { kind: "deposit", ticker: row.ticker, tokensRaw: tokensToRaw(value, row.decimals, "down") };
    const after = (r: BorrowRow) => r.depositedTokens + (r.ticker === row.ticker ? value : 0);
    preview = {
      debt: b.debtUsd,
      drop: safeUntil(b, b.debtUsd, after),
      deposits: after,
      note: "Adds collateral without borrowing. The shares stay yours and can be withdrawn later.",
    };
    if (value > max + 1e-9) blocked = `Only ${max.toFixed(4)} ${row.ticker}x is free in the wallet.`;
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
    preview = { debt: b.debtUsd, drop: safeUntil(b, b.debtUsd, after), deposits: after };
    if (value > max + 1e-9)
      blocked =
        b.debtUsd > 0
          ? "Repay some of the loan first to take that much back."
          : `Only ${max.toFixed(4)} ${row.ticker}x is pledged.`;
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
