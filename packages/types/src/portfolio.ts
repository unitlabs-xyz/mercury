import { z } from "zod";
import { Issuer, Mint, Ratio, Ticker, Usd } from "./primitives.js";

export const Holding = z.object({
  ticker: Ticker,
  name: z.string(),
  shares: Usd,
  valueUsd: Usd,
  costBasisUsd: Usd,
  unrealisedPnlUsd: Usd,
  changePct24h: Ratio,
  wrapperCount: z.number().int().positive(),
  /** Of `shares`, how many are pledged to Kamino as collateral. Still owned; not sellable until withdrawn. */
  pledgedShares: Usd.optional(),
});

export const Portfolio = z.object({
  /** Net worth: stocks plus cash less debt. */
  totalValueUsd: Usd,
  cashUsd: Usd,
  /** Owed to Kamino. Borrowed cash is inside `cashUsd`; this is the other side of it. */
  debtUsd: Usd,
  /** True when Kamino could not be read and `debtUsd` is the last hour we recorded. */
  debtIsStale: z.boolean(),
  changeUsd: Usd,
  changePct: Ratio,
  holdings: z.array(Holding),
});

/** The ranges the value chart offers. Longer ones wait for there to be data behind them. */
export const HistoryRange = z.enum(["1D", "1W", "1M"]);

/** One reading of the account's value: when it was taken, and what it was then. */
export const HistoryPoint = z.object({
  at: z.string().datetime(),
  valueUsd: Usd,
});

/**
 * The account's value over a range.
 *
 * `points` is empty for an account too new to have a line — fewer than two
 * readings is a dot, not a chart — and the client shows its empty state. The
 * timestamps are instants, not labels: only the browser knows what timezone to
 * name an hour in.
 */
export const PortfolioHistory = z.object({
  range: HistoryRange,
  points: z.array(HistoryPoint),
});

export const WrapperExposure = z.object({
  mint: Mint,
  symbol: z.string(),
  issuer: Issuer,
  tokenQty: Usd,
  multiplier: Usd,
  shares: Usd,
  valueUsd: Usd,
  sharePct: Usd,
});

export const Exposure = z.object({
  ticker: Ticker,
  shares: Usd,
  valueUsd: Usd,
  wrappers: z.array(WrapperExposure),
  warnings: z.array(
    z.object({ code: z.literal("issuer_concentration"), issuer: Issuer, sharePct: Usd, message: z.string() }),
  ),
});

export const Money = z.object({
  balanceUsd: Usd,
  yieldApr: Ratio,
  interestEarnedYtdUsd: Usd,
  depositAddress: z.string(),
  borrowingPower: z.object({ availableUsd: Usd, enabled: z.boolean() }),
});

export type Portfolio = z.infer<typeof Portfolio>;
export type PortfolioHistory = z.infer<typeof PortfolioHistory>;
export type HistoryRange = z.infer<typeof HistoryRange>;
export type Exposure = z.infer<typeof Exposure>;
export type Money = z.infer<typeof Money>;
