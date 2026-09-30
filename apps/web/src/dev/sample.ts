import type { Money, Portfolio } from "@mercury/types";
import type { Dashboard } from "../api/dashboard";
import type { Event } from "../app/activity-data";
import type { Point } from "../app/DotChart";

/**
 * SAMPLE DATA, FOR LOOKING AT THE DESIGN.
 *
 * On wherever VITE_SAMPLE=1: `pnpm dev:web:sample` locally, or a deployed
 * preview built with it set (the design demo). Off, the bundler drops all of
 * this. Locally it also skips sign-in; a deployed build still signs you in
 * with Privy, then shows these figures instead of your account's. It answers the app's own API reads with the
 * numbers in the portfolio design, so each screen can be checked against it.
 * Everything it does not cover (instruments, logos, market status) still goes
 * to the real API.
 */
export const SAMPLE = import.meta.env["VITE_SAMPLE"] === "1";
/** Local sample runs only: straight past sign-in. A deployed sample build keeps it. */
export const SAMPLE_NO_LOGIN = SAMPLE && import.meta.env.DEV;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const holding = (
  ticker: string,
  name: string,
  shares: string,
  value: number,
  cost: number,
  today: string,
  wrapperCount = 1,
): Portfolio["holdings"][number] => ({
  ticker,
  name,
  shares,
  valueUsd: value.toFixed(2),
  costBasisUsd: cost.toFixed(2),
  unrealisedPnlUsd: (value - cost).toFixed(2),
  changePct24h: today,
  wrapperCount,
  pledgedShares: ticker === "SPY" ? "3" : "0",
});

// Nvidia and Tesla are left out on purpose, so some listed stocks show as not owned.
const holdings = [
  holding("SPY", "S&P 500", "5.998", 3893.99, 3622.4, "0.31"),
  holding("AAPL", "Apple", "3.120", 768.14, 700, "0.62", 2),
  holding("HOOD", "Robinhood", "4.800", 583.39, 474, "3.12"),
  holding("GOOGL", "Alphabet", "1.650", 412.5, 430.01, "-0.41", 2),
  holding("META", "Meta", "0.520", 380.36, 350, "2.35"),
];
const cash = 4534.73;
const stocks = holdings.reduce((s, h) => s + Number(h.valueUsd), 0);

const portfolio: Portfolio = {
  totalValueUsd: (stocks + cash).toFixed(2),
  cashUsd: cash.toFixed(2),
  changeUsd: "39.32",
  changePct: "0.32",
  holdings,
};

const money: Money = {
  balanceUsd: cash.toFixed(2),
  yieldApr: "0.041",
  interestEarnedYtdUsd: "48.20",
  depositAddress: "7xQmF4d8Vn2pLs9jKcRb3TyWuAeH6gZxMq1NdP4Rk9",
  borrowingPower: { availableUsd: "2700", enabled: true },
} as Money;

/** GET /v1/borrow, in its wire shape: 3 SPYx pledged, $1,988.23 owed, healthy. */
const row = (ticker: string, ltv: number, lt: number, price: number, deposited: number, free: number) => ({
  ticker,
  isStock: true,
  decimals: 8,
  ltv: String(ltv),
  liquidationThreshold: String(lt),
  pricePerToken: String(price),
  depositedTokens: String(deposited),
  depositedUsd: (deposited * price).toFixed(2),
  depositableTokens: String(free),
  depositableUsd: (free * price).toFixed(2),
  safeLimitUsd: ((deposited + free) * price * ltv * 0.8).toFixed(2),
  borrowableUsd: (free * price * ltv * 0.8).toFixed(2),
  cushionAtTarget: (1 - (ltv * 0.8) / lt).toFixed(4),
  liquidationPrice: deposited > 0 ? (1988.23 / (deposited * lt)).toFixed(2) : null,
  liquidationDistance: deposited > 0 ? (1 - 1988.23 / (deposited * lt) / price).toFixed(4) : null,
});
const borrow = {
  safetyTarget: "0.8",
  cashUsd: cash.toFixed(2),
  // 3 SPYx and $5,930 of Bitcoin pledged against $1,988.23: using 25%, limit 60%, as in the design.
  collateralUsd: (3 * 664.22 + 0.07 * 84_720).toFixed(2),
  debtUsd: "1988.23",
  borrowableNowUsd: "812.40",
  overTargetUsd: "0",
  health: "healthy",
  locked: false,
  usage: "0.32",
  repayToClearMarginCallUsd: "0",
  dropToMarginCall: "0.5882",
  borrowableUsd: "2700",
  spendableUsd: (cash + 2700).toFixed(2),
  ltv: "0.25",
  liquidationLtv: "0.32",
  safeUntilDrop: "0.68",
  poolAvailableUsd: "538408.73",
  borrowApy: "0.0578",
  obligation: "SampleObligation11111111111111111111111111",
  collateral: [
    { ...row("cbBTC", 0.75, 0.8, 84_720, 0.07, 0), isStock: false },
    row("SPY", 0.73, 0.75, 664.22, 3, 2.998),
    // Accepted by Kamino, but none held: they do not show as borrowable.
    row("NVDA", 0.55, 0.65, 222.11, 0, 0),
    row("TSLA", 0.55, 0.65, 426.07, 0, 0),
    row("GOOGL", 0.6, 0.7, 250, 0, 1.65),
    row("AAPL", 0.4, 0.5, 246.2, 0, 3.12),
    row("HOOD", 0.3, 0.4, 122.79, 0, 4.8),
  ],
};

export const SAMPLE_DASHBOARD: Dashboard = {
  loan: null,
  card: {
    plan: "Gold",
    finish: "gold",
    last4: "4821",
    mode: "credit",
    monthlyLimitUsd: 3986,
    spentThisMonthUsd: 1240.18,
    statementBalanceUsd: 986.4,
    statementDue: day(9),
    minimumDueUsd: 40,
    autopay: true,
    cashbackRate: 0.015,
    cashbackEarnedUsd: 18.6,
    frozen: false,
    transactions: [],
  },
  upcoming: [
    { date: day(2), kind: "recurring", title: "Recurring buy", detail: "", amountUsd: 50 },
    { date: day(3), kind: "queued", title: "Queued order · Apple", detail: "", amountUsd: 100 },
    { date: day(5), kind: "interest", title: "Interest payout", detail: "", amountUsd: 15.49 },
    { date: day(9), kind: "card", title: "Card statement due", detail: "", amountUsd: 986.4 },
  ],
  ltv: null,
};

/*
 * Mints and logos are carried the way the feed now sends them: SOL and USDC
 * are money and resolve to their own marks, a trade resolves to the stock's,
 * and interest and a queued order have no asset behind them and keep the kind
 * icon. One of each, so the Activity row's mark can be seen in every state it
 * has without an account that has done all six things.
 */
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const xstock = (symbol: string) => `https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`;

export const SAMPLE_EVENTS: Event[] = [
  {
    date: day(0),
    kind: "receive",
    title: "Added cash",
    sub: "",
    amount: "$250.00",
    flow: "in",
    mint: USDC,
    details: [],
  },
  {
    date: day(0),
    kind: "receive",
    title: "Received SOL",
    sub: "",
    amount: "$2.31",
    flow: "in",
    mint: SOL,
    details: [],
  },
  {
    date: day(0),
    kind: "buy",
    title: "Bought SpaceX",
    sub: "0.0335 shares at $149.17",
    amount: "$5.00",
    flow: "out",
    logo: xstock("SPCXx"),
    details: [],
  },
  {
    date: day(0),
    kind: "queued",
    title: "Order queued",
    sub: "",
    amount: "$100.00",
    flow: "out",
    pending: true,
    details: [],
  },
  {
    date: day(-1),
    kind: "buy",
    title: "Bought Meta",
    sub: "",
    amount: "$500.00",
    flow: "out",
    logo: xstock("METAx"),
    details: [],
  },
  {
    date: day(-1),
    kind: "send",
    title: "Sent USDC",
    sub: "",
    amount: "$250.00",
    flow: "out",
    mint: USDC,
    details: [],
  },
  {
    date: day(-1),
    kind: "interest",
    title: "Interest paid",
    sub: "",
    amount: "$12.42",
    flow: "in",
    details: [],
  },
  {
    date: day(-2),
    kind: "recurring",
    title: "Recurring run · $200 into S&P 500",
    sub: "",
    amount: "$200.00",
    flow: "out",
    logo: xstock("SPYx"),
    details: [],
  },
] as Event[];

/** The last month of account value, ending at the design's +$547.62. */
const series = (n: number, label: (i: number) => string): Point[] => {
  let v = 11_932.99;
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    // A dip in the first third, then a climb: the shape in the design.
    v =
      11_932.99 +
      547.62 * f -
      520 * Math.sin(Math.PI * Math.min(1, f * 1.8)) * (1 - f) +
      40 * Math.sin(i * 1.7);
    if (i === n - 1) v = 12_480.61;
    return { label: label(i), value: Math.round(v * 100) / 100 };
  });
};
export const SAMPLE_HISTORY = {
  "1D": series(48, (i) =>
    new Date(Date.now() - (47 - i) * 30 * 60_000).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  ),
  "1W": series(56, (i) =>
    new Date(Date.now() - (55 - i) * 3 * 3_600_000).toLocaleString("en-US", {
      weekday: "short",
      day: "numeric",
      hour: "2-digit",
    }),
  ),
  "1M": series(60, (i) => {
    const d = new Date(Date.now() - (59 - i) * 12 * 3_600_000);
    return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
  }),
};

/**
 * Four stock vaults that exist on Symmetry today, read from chain on 28
 * September 2026 with @symmetry-hq/sdk: their weights, fees, addresses and
 * creation dates are Symmetry's own. The vaults hold almost nothing yet, so the
 * value of each is worked out in the app from its stocks' price histories, from
 * $1.00 on the day it was created. The one position is sample.
 */
const vault = (address: string, mint: string, symbol: string, creator: string, createdAt: number) => ({
  address,
  mint,
  symbol,
  creator,
  createdAt,
  startPrice: 1,
});
const baskets = [
  {
    slug: "not-insider-trading",
    name: "Not Insider Trading",
    description:
      "Eight US tech names, from chips to cloud security, weighted by the creator rather than by size.",
    feeBps: 0,
    depositFeeBps: 0,
    withdrawFeeBps: 50,
    minimumUsd: "25",
    capUsd: null,
    venue: "symmetry",
    constituents: [
      { ticker: "GOOGL", weightBps: 1600 },
      { ticker: "NVDA", weightBps: 1500 },
      { ticker: "AVGO", weightBps: 1400 },
      { ticker: "AMZN", weightBps: 1200 },
      { ticker: "AAPL", weightBps: 1100 },
      { ticker: "MSFT", weightBps: 1100 },
      { ticker: "META", weightBps: 1100 },
      { ticker: "CRWD", weightBps: 1000 },
    ],
    vault: vault(
      "G54nsrBx9a59YVqiqk2Sg3yX9wQauRz5MEugdWDjvmsf",
      "FXcxe5f3AwkJZRaoYFuGME7rEXS4NmBxZPYKVh3Q4bnD",
      "NIT",
      "4RLo2SCDEbFFWU9R1Pw5ogz7YHevxv1gLevZ3RyMEFFL",
      1777467071,
    ),
    position: { tokens: 430.2, costUsd: 420 },
  },
  {
    slug: "mag-7",
    name: "Mag 7",
    description:
      "The seven companies that have driven most of the US market's gains, in equal parts. The simplest way to own all of them.",
    feeBps: 0,
    depositFeeBps: 0,
    withdrawFeeBps: 0,
    minimumUsd: "25",
    capUsd: null,
    venue: "symmetry",
    constituents: [
      { ticker: "AAPL", weightBps: 1432 },
      { ticker: "MSFT", weightBps: 1428 },
      { ticker: "NVDA", weightBps: 1428 },
      { ticker: "GOOGL", weightBps: 1428 },
      { ticker: "AMZN", weightBps: 1428 },
      { ticker: "META", weightBps: 1428 },
      { ticker: "TSLA", weightBps: 1428 },
    ],
    vault: vault(
      "Dzuo8qSiMH5KjoVhqj9gd1g7PbB9FotqhgrLEYj3qUZT",
      "3yej5SrC6vr5rLVvYPVBs2fo33zSsU4nHNyRHYTu9zUx",
      "MAG7",
      "9YiGcJN4DMoQoWBSs51vUpFMBsPeKLWrFnDhah5bocFL",
      1789593739,
    ),
    position: null,
  },
  {
    slug: "mag-7-caucus",
    name: "Mag7 Caucus",
    description:
      "The same seven, weighted toward Microsoft and Apple and away from Tesla. Steadier than equal weights, with less upside from the fastest movers.",
    feeBps: 25,
    depositFeeBps: 25,
    withdrawFeeBps: 0,
    minimumUsd: "25",
    capUsd: null,
    venue: "symmetry",
    constituents: [
      { ticker: "MSFT", weightBps: 3448 },
      { ticker: "AAPL", weightBps: 2740 },
      { ticker: "GOOGL", weightBps: 1424 },
      { ticker: "AMZN", weightBps: 1151 },
      { ticker: "NVDA", weightBps: 854 },
      { ticker: "META", weightBps: 322 },
      { ticker: "TSLA", weightBps: 61 },
    ],
    vault: vault(
      "AwDFvjEPPwdF1YgXV8asNt6LeEFDduinYneCn6mHDAsh",
      "9ihGfswnUZ6MysSR3KgmrZ57FXDVAiAQ6sEHwLuWwzJ4",
      "IITMAGCA",
      "H6pLh8nFv1teY9G6JAVQuZQxeUvGfwYf1aPXHkDPDRph",
      1789652010,
    ),
    position: null,
  },
  {
    slug: "bald-founder-index",
    name: "Bald Founder Index",
    description:
      "Four companies run by their founders, across online retail, software and crypto. Concentrated, and it moves with Bitcoin.",
    feeBps: 0,
    depositFeeBps: 0,
    withdrawFeeBps: 50,
    minimumUsd: "25",
    capUsd: null,
    venue: "symmetry",
    constituents: [
      { ticker: "AMZN", weightBps: 3100 },
      { ticker: "COIN", weightBps: 2700 },
      { ticker: "MSFT", weightBps: 2200 },
      { ticker: "GLXY", weightBps: 2000 },
    ],
    vault: vault(
      "EPE5SRsPYUUgYefm7sSns4BYfi5HxMdPuNDfchoYzN9s",
      "9TUeXbEgrS4ohSkEUjnRbRuSQv3zaryYMWs64M6cCeD",
      "BFI",
      "4RLo2SCDEbFFWU9R1Pw5ogz7YHevxv1gLevZ3RyMEFFL",
      1777919670,
    ),
    position: null,
  },
];

/** The API reads this answers. Anything else goes to the real API. */
export const sampleResponse = (path: string): unknown | undefined => {
  const route = path.split("?")[0];
  if (route === "/v1/portfolio") return portfolio;
  if (route === "/v1/money") return money;
  if (route === "/v1/borrow") return borrow;
  if (route === "/v1/baskets") return { baskets };
  if (route === "/v1/activity") return { items: [], nextCursor: null };
  return undefined;
};
