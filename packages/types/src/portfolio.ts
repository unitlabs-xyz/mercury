import { z } from "zod";
import { Issuer, Mint, Ratio, Ticker, Usd } from "./primitives.js";

export const Holding = z.object({
  ticker: Ticker,
  name: z.string(),
  shares: Usd,
  valueUsd: Usd,
  costBasisUsd: Usd,
  /** The dollars the position is up or down: `marketPnlUsd` less `tradingCostUsd`. */
  unrealisedPnlUsd: Usd,
  /**
   * Of that, what the stock did — today's quote against the quote it was
   * bought against. Optional for a client reading an older server.
   */
  marketPnlUsd: Usd.optional(),
  /** And what it cost to get in: premium and spread paid, plus fees. Positive is a cost. */
  tradingCostUsd: Usd.optional(),
  /** Shares covered by recorded purchase lots; other shares have unknown basis. */
  sharesWithBasis: Usd.optional(),
  changePct24h: Ratio,
  wrapperCount: z.number().int().positive(),
  /** Of `shares`, how many are pledged to Kamino as collateral. Still owned; not sellable until withdrawn. */
  pledgedShares: Usd.optional(),
});

export const Portfolio = z.object({
  /** Net worth: wallet and pledged stocks, wallet cash, and Glider baskets, less debt. */
  totalValueUsd: Usd,
  cashUsd: Usd,
  /** Cash in the Earn vault, counted in the total but not spendable this second. Optional for older servers. */
  earnUsd: Usd.optional(),
  basketUsd: Usd,
  /** Owed to Kamino. Borrowed cash is inside `cashUsd`; this is the other side of it. */
  debtUsd: Usd,
  /** True when Kamino could not be read and `debtUsd` is the last hour we recorded. */
  debtIsStale: z.boolean(),
  /** Estimated rolling 24-hour price move of wallet, pledged, and basket stocks; excludes cash and transfers. */
  changeUsd: Usd,
  changePct: Ratio,
  holdings: z.array(Holding),
  baskets: z.array(
    z.object({
      portfolioId: z.string(),
      slug: z.string().nullable(),
      name: z.string(),
      valueUsd: Usd,
      inTransitUsd: Usd,
      /** Estimated price move on currently held basket assets, not account P&L. */
      changePct24h: Ratio.nullable(),
      /**
       * What went into this basket and never came back out: cash in less cash
       * out. A basket has no lots — the fills happen inside Glider — so this is
       * the only basis there is.
       */
      costBasisUsd: Usd.optional(),
      /**
       * Value against that basis. A total, net of everything Glider charged,
       * and not separable into the stocks' move and the cost of trading them
       * the way a wallet holding's return is.
       */
      pnlUsd: Usd.optional(),
      returnPct: Ratio.nullable().optional(),
      /**
       * False when something left this basket in kind, so no dollar figure was
       * recorded for it and the basis understates what came back out.
       */
      basisIsComplete: z.boolean().optional(),
      fetchedAt: z.string().datetime(),
      holdings: z.array(
        z.object({
          assetId: z.string(),
          symbol: z.string(),
          ticker: z.string().nullable(),
          balance: z.string(),
          valueUsd: Usd,
        }),
      ),
    }),
  ),
});

/** The ranges the value chart offers. Longer ones wait for there to be data behind them. */
export const HistoryRange = z.enum(["1D", "1W", "1M"]);

/** One reading of the account's value: when it was taken, and what it was then. */
export const HistoryPoint = z.object({
  at: z.string().datetime(),
  valueUsd: Usd,
  /**
   * Deposits less withdrawals since the first point. `valueUsd - netFlowUsd` is
   * what the account would be worth had no money come or gone: its change is
   * performance. Optional so an older server still parses.
   */
  netFlowUsd: Usd.optional(),
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
  /** USDC in the Earn vault. Optional so an older server still parses. */
  earnUsd: Usd.optional(),
  depositAddress: z.string(),
  borrowingPower: z.object({ availableUsd: Usd, enabled: z.boolean() }),
});

export type Portfolio = z.infer<typeof Portfolio>;
export type PortfolioHistory = z.infer<typeof PortfolioHistory>;
export type HistoryRange = z.infer<typeof HistoryRange>;
export type Exposure = z.infer<typeof Exposure>;
export type Money = z.infer<typeof Money>;
