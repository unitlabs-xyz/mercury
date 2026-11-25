import { z } from "zod";
import { Issuer, Mint, Ratio, Ticker, Usd } from "./primitives.js";

/**
 * Where an estimated cost came from: SOL's price in a swap paid in SOL, the
 * share's market price when it arrived, the earliest price Mercury has, the
 * price when the wallet was linked, the cost it had in another of the
 * person's wallets, or what another stock swapped for it was worth then.
 */
export const EstimateSource = z.enum([
  "sol_price",
  "market_price",
  "earliest_price",
  "link_day_price",
  "own_wallet",
  "token_price",
]);
export type EstimateSource = z.infer<typeof EstimateSource>;

export const Holding = z.object({
  ticker: Ticker,
  name: z.string(),
  shares: Usd,
  valueUsd: Usd,
  costBasisUsd: Usd,
  /** The dollars the position is up or down: `marketPnlUsd` less `tradingCostUsd`. */
  unrealisedPnlUsd: Usd,
  /** Of that, what the stock did — today's quote against the quote it was bought against. */
  marketPnlUsd: Usd,
  /** And what it cost to get in: premium and spread paid, plus fees. Positive is a cost. */
  tradingCostUsd: Usd,
  /** Shares covered by recorded purchase lots; other shares have unknown basis. */
  sharesWithBasis: Usd.optional(),
  changePct24h: Ratio,
  wrapperCount: z.number().int().positive(),
  /** Of `shares`, how many are pledged to Kamino as collateral. Still owned; not sellable until withdrawn. */
  pledgedShares: Usd.optional(),
  /**
   * Of `costBasisUsd`, how much was estimated rather than read off a trade.
   * Above zero, the holding's return is shown with `~`. Optional for older servers.
   */
  estimatedCostUsd: Usd.optional(),
  /** Where most of that estimate came from, for the line that says so. Null when none is estimated. */
  estimateSource: EstimateSource.nullable().optional(),
});

/** One wallet's part of a portfolio read for several, live: what a wallet's card on Home shows. */
export const WalletValue = z.object({
  walletId: z.string(),
  totalValueUsd: Usd,
  debtUsd: Usd,
  changeUsd: Usd,
  changePct: Ratio,
});

export const Portfolio = z.object({
  /** Net worth: wallet and pledged stocks, wallet cash, and Glider baskets, less debt. */
  totalValueUsd: Usd,
  cashUsd: Usd,
  /** Cash in the Earn vault, counted in the total but not spendable this second. Optional for older servers. */
  earnUsd: Usd.optional(),
  /** Kamino could not be read, so `earnUsd` is the last hourly reading's. Optional for older servers. */
  earnIsStale: z.boolean().optional(),
  basketUsd: Usd,
  /** Owed to Kamino. Borrowed cash is inside `cashUsd`; this is the other side of it. */
  debtUsd: Usd,
  /** True when Kamino could not be read and `debtUsd` is the last hour we recorded. */
  debtIsStale: z.boolean(),
  /** Estimated rolling 24-hour price move of wallet, pledged, and basket stocks; excludes cash and transfers. */
  changeUsd: Usd,
  changePct: Ratio,
  holdings: z.array(Holding),
  /**
   * Each wallet the read covered, valued on its own, in the order the
   * figures above add them up. One entry for one wallet. Optional for older servers.
   */
  wallets: z.array(WalletValue).optional(),
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
   * performance.
   */
  netFlowUsd: Usd,
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

/**
 * The summary at the top of Home: every followed wallet, from what the
 * database already holds. No chain read, so it is cheap to poll; Home shows
 * live figures beside it while it is open, from `Portfolio` read for every wallet.
 */
export const PortfolioSummary = z.object({
  wallets: z.array(
    z.object({
      id: z.string(),
      address: z.string(),
      isPrimary: z.boolean(),
      label: z.string().nullable(),
      /** The latest hourly reading, net of debt. Null before the first one, minutes after linking. */
      valueUsd: Usd.nullable(),
      /** When that reading's balances were read. */
      asOf: z.string().datetime().nullable(),
      debtUsd: Usd,
      /** The loan's health as last recorded by the loan watch; null with no loan. */
      loanHealth: z.enum(["healthy", "over_limit", "margin_call", "liquidation"]).nullable(),
      /** "calculating" until the wallet's past is read; its P&L, income and interest wait for it. */
      history: z.enum(["ready", "calculating"]),
    }),
  ),
  /** Every wallet's latest reading added up. Wallets with no reading yet are left out. */
  netWorthUsd: Usd,
  /** The oldest reading in `netWorthUsd`: how stale the figure can be. */
  asOf: z.string().datetime().nullable(),
  pnl: z.object({
    /** Unrealised and realised, over the wallets that are ready. */
    totalUsd: Usd,
    unrealisedUsd: Usd,
    realisedUsd: Usd,
    /** Unrealised against the cost of the shares still held, as a percentage. Null with no cost. */
    returnPct: Ratio.nullable(),
    /** How much of that cost was estimated; the P&L starts with `~` when any was. */
    estimatedCostUsd: Usd,
  }),
  income: z.object({
    totalUsd: Usd,
    earnUsd: Usd,
    dividendsUsd: Usd,
    /**
     * Some Earn shares were sent in or out by hand and valued at a day's share
     * price, so what was earned starts with `~`. Optional for older servers.
     */
    earnEstimated: z.boolean().optional(),
  }),
  /** Interest owed on every ready wallet's loan: what is owed beyond what was borrowed. */
  loanInterestUsd: Usd,
  /**
   * Interest already paid on every ready wallet's loans: what repayments took
   * beyond what was borrowed. With `loanInterestUsd`, what borrowing has cost.
   * Optional for older servers.
   */
  loanInterestPaidUsd: Usd.optional(),
  /** Wallets whose past is still being read, and so are not in P&L, income or interest. */
  calculating: z.number().int().nonnegative(),
});
export type PortfolioSummary = z.infer<typeof PortfolioSummary>;
