import type { Money, Portfolio } from "@mercury/types";
import type { Dashboard } from "../api/dashboard";
import type { Event } from "@mercury/view";

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
  // A quarter of a percent of the cost went on fees and spread, which is about
  // what a real fill gives up. Sample mode has to show the stacked figures or
  // the one screen built to check them cannot be checked.
  tradingCostUsd: (cost * 0.0025).toFixed(2),
  marketPnlUsd: (value - cost + cost * 0.0025).toFixed(2),
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
/* A loan, so sample mode exercises the borrowed line and the cushion rather than the empty case. */
const debt = 2500;
const stocks = holdings.reduce((s, h) => s + Number(h.valueUsd), 0);

/**
 * Two owned baskets, with a cost basis — which is the only way the Baskets
 * figure and the basket rows' dollar return can be looked at before a real
 * account has one. One of them paid out in kind once, so its basis is partial.
 */
const sampleBaskets: Portfolio["baskets"] = [
  {
    portfolioId: "sample-mag7",
    slug: "mag7",
    name: "Magnificent Seven",
    valueUsd: "612.40",
    inTransitUsd: "0",
    changePct24h: "0.84",
    costBasisUsd: "550.00",
    pnlUsd: "62.40",
    returnPct: "11.35",
    basisIsComplete: true,
    fetchedAt: new Date().toISOString(),
    holdings: [],
  },
  {
    portfolioId: "sample-quantum",
    slug: "quantum",
    name: "Mercury Solana - Quantum",
    valueUsd: "245.10",
    inTransitUsd: "0",
    changePct24h: "-1.20",
    costBasisUsd: "280.00",
    pnlUsd: "-34.90",
    returnPct: "-12.46",
    basisIsComplete: false,
    fetchedAt: new Date().toISOString(),
    holdings: [],
  },
];
const basketUsd = sampleBaskets.reduce((sum, b) => sum + Number(b.valueUsd), 0);

const portfolio: Portfolio = {
  totalValueUsd: (stocks + cash + basketUsd - debt).toFixed(2),
  cashUsd: cash.toFixed(2),
  basketUsd: basketUsd.toFixed(2),
  debtUsd: debt.toFixed(2),
  debtIsStale: false,
  changeUsd: "39.32",
  changePct: "0.32",
  holdings,
  baskets: sampleBaskets,
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
    // Held as Ondo only: Kamino takes GOOGLx, so none of it backs a loan.
    row("GOOGL", 0.6, 0.7, 250, 0, 0),
    // 1.2 of the 3.12 as AAPLx; the rest is Ondo and is not counted.
    row("AAPL", 0.4, 0.5, 246.2, 0, 1.2),
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
    date: day(-3),
    kind: "borrow",
    title: "Borrowed $2,500.00 against SPYx",
    sub: "",
    amount: "$2,500.00",
    flow: "in",
    logo: xstock("SPYx"),
    details: [],
  },
  {
    date: day(-3),
    kind: "pledge",
    title: "Pledged 3.85 SPYx",
    sub: "Held by Kamino as collateral",
    amount: null,
    flow: null,
    logo: xstock("SPYx"),
    details: [],
  },
] as Event[];

/** The last month of account value, ending at the design's +$547.62. */
const series = (n: number, stepMs: number): { at: string; valueUsd: string }[] => {
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
    return {
      at: new Date(Date.now() - (n - 1 - i) * stepMs).toISOString(),
      valueUsd: (Math.round(v * 100) / 100).toFixed(2),
    };
  });
};

/**
 * Sample history in the shape the wire uses, not in the shape the chart draws.
 *
 * It used to be pre-labelled points handed straight to the chart, which meant
 * sample mode was the one path that never ran the labelling code — so a broken
 * formatter looked fine in design review and wrong in production.
 */
export const SAMPLE_HISTORY: Record<string, { at: string; valueUsd: string }[]> = {
  "1D": series(24, 3_600_000),
  "1W": series(56, 3 * 3_600_000),
  "1M": series(60, 12 * 3_600_000),
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
/**
 * GET /v1/portfolio/exposure/:ticker, wallet only (pledged shares are not in it).
 * AAPL is split across both issuers, GOOGL is Ondo only, SPY is xStocks with 3 pledged.
 */
const SPLITS: Record<string, [issuer: "backed" | "ondo", shares: number][]> = {
  AAPL: [
    ["backed", 1.2],
    ["ondo", 1.92],
  ],
  GOOGL: [["ondo", 1.65]],
  SPY: [["backed", 2.998]],
};
const exposure = (ticker: string) => {
  const h = holdings.find((x) => x.ticker === ticker);
  if (!h) return undefined;
  const per = Number(h.valueUsd) / Number(h.shares);
  const split = SPLITS[ticker] ?? [["backed", Number(h.shares)]];
  const total = split.reduce((s, [, n]) => s + n, 0);
  return {
    ticker,
    shares: total.toFixed(6),
    valueUsd: (total * per).toFixed(2),
    wrappers: split.map(([issuer, n]) => ({
      mint: `${ticker}${issuer}Mint`,
      symbol: issuer === "backed" ? `${ticker}x` : `${ticker}on`,
      issuer,
      tokenQty: n.toFixed(6),
      multiplier: "1",
      shares: n.toFixed(6),
      valueUsd: (n * per).toFixed(2),
      sharePct: ((n / total) * 100).toFixed(2),
    })),
    warnings: [],
  };
};

/* ── quotes and baskets, so the order review and the basket rows have something to show ── */

const MINT: Record<string, Record<"backed" | "ondo", string>> = {
  AAPL: {
    backed: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    ondo: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
  },
  GOOGL: {
    backed: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    ondo: "GOOGLondoSampleMint11111111111111111111ondo",
  },
};
const FAIR: Record<string, number> = {
  NVDA: 237.09,
  AAPL: 335.41,
  GOOGL: 345.4,
  SPY: 664.22,
  HOOD: 122.79,
  META: 721.76,
};

const quote = (body: string | undefined) => {
  const req = JSON.parse(body ?? "{}") as { ticker?: string; side?: "buy" | "sell"; amount?: string };
  const ticker = req.ticker ?? "AAPL";
  const side = req.side ?? "buy";
  const amount = Number(req.amount ?? 100);
  const fair = FAIR[ticker] ?? 100;
  const held = Object.fromEntries((SPLITS[ticker] ?? [["backed", 1]]).map(([i, n]) => [i, n]));
  // Ondo a touch cheaper to buy, xStocks a touch better to sell: the choice is worth showing both ways.
  const offers = (["backed", "ondo"] as const)
    .filter((issuer) => side === "buy" || (held[issuer] ?? 0) > 0)
    .map((issuer) => {
      const price =
        side === "buy"
          ? fair * (issuer === "ondo" ? 0.9992 : 1.0004)
          : fair * (issuer === "backed" ? 1.0002 : 0.9991);
      const shares = side === "buy" ? amount / price : Math.min(amount / price, held[issuer] ?? 0);
      return {
        mint: MINT[ticker]?.[issuer] ?? `${ticker}${issuer}`,
        symbol: issuer === "backed" ? `${ticker}x` : `${ticker}on`,
        issuer,
        multiplier: "1",
        pricePerToken: price.toFixed(4),
        pricePerShare: price.toFixed(4),
        worstPricePerShare: (side === "buy" ? price * 1.005 : price * 0.995).toFixed(4),
        filledShares: shares.toFixed(6),
        priceImpact: ticker === "NVDA" && issuer === "ondo" ? "0.0720" : "0.0004",
        routeLabels: issuer === "backed" ? ["Byreal"] : ["Meteora DLMM"],
        // NVDA on Ondo is the real case: about $2.7K of liquidity, so even $9 moves it 7%.
        ...(ticker === "NVDA" && issuer === "ondo"
          ? { viable: false, rejection: "impact_too_high" }
          : { viable: true, rejection: null }),
      };
    })
    .sort((a, b) => (side === "buy" ? 1 : -1) * (Number(a.pricePerShare) - Number(b.pricePerShare)));
  const best = offers.find((o) => o.viable) ?? offers[0]!;
  /* The server's charge, roughly: 0.5% of the worth, rounded down to the cent, and a cent of network. */
  const gross = Number(best.filledShares) * Number(best.pricePerShare);
  const worth = side === "buy" ? amount : gross;
  const mercury = Math.floor(worth * 0.5) / 100;
  const total = mercury + 0.01;
  return {
    decision: {
      kind: "execute",
      ticker,
      side,
      amount: amount.toFixed(2),
      fairPricePerShare: fair.toFixed(4),
      status: "open",
      candidates: offers,
      decidedAt: new Date().toISOString(),
      maxSlippageBps: 50,
      best,
      premium: (Number(best.pricePerShare) / fair - 1).toFixed(6),
      warning: null,
    },
    fee: {
      usdc: total.toFixed(2),
      lamports: 5_000,
      network: "0.01",
      mercury: mercury.toFixed(2),
      mercuryBps: 50,
    },
    investable: side === "buy" ? (amount - total).toFixed(2) : null,
    proceeds: side === "sell" ? (gross - total).toFixed(2) : null,
  };
};

const CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const OWNED_BASKETS = [
  { slug: "magnificent-seven", name: "Mercury Solana - Magnificent Seven", count: 7, value: 367.3 },
  { slug: "quantum", name: "Mercury Solana - Quantum", count: 8, value: 245.1 },
];
const basketPortfolio = (slug: string) => ({
  portfolioId: `sample-${slug}`,
  ownerAccountId: `${CHAIN}:7xQmF4d8Vn2pLs9jKcRb3TyWuAeH6gZxMq1NdP4Rk9`,
  strategyId: `sample-${slug}`,
  smartAccounts: [{ accountId: `${CHAIN}:GLDRsmart1111111111111111111111111111111111` }],
});
/* Magnificent Seven's own Ondo mints, so the assets match the template's allocations. */
const MAG7 = [
  ["NVDA", "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo", 0.402, 186.2],
  ["TSLA", "KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo", 0.171, 426.07],
  ["MSFT", "FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo", 0.139, 527.28],
  ["AAPL", "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo", 0.218, 335.41],
  ["AMZN", "14Tqdo8V1FhzKsE3W2pFsZCzYPQxxupXRcqw9jv6ondo", 0.285, 256.76],
] as const;
const basketSnapshot = (slug: string) => {
  const assets =
    slug === "magnificent-seven"
      ? MAG7.map(([ticker, mint, balance, price]) => ({
          assetId: `${CHAIN}/spl:${mint}`,
          smartAccountId: `${CHAIN}:GLDRsmart1111111111111111111111111111111111`,
          symbol: `${ticker}on`,
          decimals: 9,
          balance: String(balance),
          balanceRaw: String(Math.round(balance * 1e9)),
          priceUsd: String(price),
          valueUsd: (balance * price).toFixed(2),
        }))
      : [];
  const total = assets.reduce((s, a) => s + Number(a.valueUsd), 0);
  return {
    ...basketPortfolio(slug),
    schedule: {
      status: "active",
      frequency: "daily",
      intervalMs: 86_400_000,
      nextDueAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
      lastRebalanceAt: new Date(Date.now() - 19 * 3_600_000).toISOString(),
    },
    totalValueUsd: total.toFixed(2),
    inTransitUsd: "0",
    fetchedAt: new Date().toISOString(),
    assets,
    warnings: [],
  };
};
const basketRoute = (route: string) => {
  if (route === "/v1/basket-portfolios") {
    return {
      portfolios: OWNED_BASKETS.map((b) => ({
        portfolioId: `sample-${b.slug}`,
        strategyId: `sample-${b.slug}`,
        slug: b.slug,
        name: b.name,
        targetAssetCount: b.count,
        totalValueUsd: b.value.toFixed(2),
        usdcBalance: "0",
        inTransitUsd: "0",
        fetchedAt: new Date().toISOString(),
        partial: false,
      })),
    };
  }
  const m = /^\/v1\/basket-templates\/([^/]+)\/(enrollment|portfolio|activity)$/.exec(route);
  if (!m) return undefined;
  const [, slug = "", what] = m;
  const owned = OWNED_BASKETS.some((b) => b.slug === slug);
  if (what === "enrollment") return { portfolio: owned ? basketPortfolio(slug) : null };
  if (what === "portfolio") return { portfolio: owned ? basketSnapshot(slug) : null };
  return { activity: [] };
};

/**
 * The deposit picker, which otherwise cannot be looked at without a backend
 * that has a Relay key.
 *
 * The artwork urls are the real ones — the chain marks come from Relay's CDN
 * and the token logos from CoinGecko, both public — because the thing most
 * worth checking here is how real logos sit at this size, and placeholders
 * would check the placeholder path instead. One token deliberately has none,
 * so the lettered fallback is on screen rather than only in a test.
 */
const relayIcon = (chainId: number) => `https://assets.relay.link/icons/${chainId}/light.png`;
const coin = (id: string) => `https://coin-images.coingecko.com/coins/images/${id}`;

const SAMPLE_CHAINS = [
  { chainId: 792703809, name: "Solana", vmType: "svm" },
  { chainId: 8453, name: "Base", vmType: "evm" },
  { chainId: 1, name: "Ethereum", vmType: "evm" },
  { chainId: 42161, name: "Arbitrum", vmType: "evm" },
  { chainId: 10, name: "Optimism", vmType: "evm" },
  { chainId: 137, name: "Polygon", vmType: "evm" },
  { chainId: 56, name: "BNB Chain", vmType: "evm" },
  { chainId: 43114, name: "Avalanche", vmType: "evm" },
  { chainId: 130, name: "Unichain", vmType: "evm" },
].map((c) => ({ ...c, iconUrl: relayIcon(c.chainId) }));

const sampleToken = (
  chainId: number,
  address: string,
  symbol: string,
  name: string,
  decimals: number,
  logoUrl: string | null,
) => {
  const chain = SAMPLE_CHAINS.find((c) => c.chainId === chainId)!;
  return {
    chainId,
    chainName: chain.name,
    chainIconUrl: chain.iconUrl,
    vmType: chain.vmType,
    address,
    symbol,
    name,
    decimals,
    logoUrl,
  };
};

const SAMPLE_TOKENS = [
  sampleToken(792703809, USDC, "USDC", "USD Coin", 6, coin("6319/large/usdc.png?1696506694")),
  sampleToken(792703809, SOL, "SOL", "Solana", 9, coin("4128/large/solana.png?1718769756")),
  sampleToken(
    792703809,
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "USDT",
    "Tether",
    6,
    coin("325/large/Tether.png?1696501661"),
  ),
  sampleToken(
    8453,
    "0x0000000000000000000000000000000000000000",
    "ETH",
    "Ether",
    18,
    coin("279/large/ethereum.png?1696501628"),
  ),
  sampleToken(
    8453,
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    "USDC",
    "USD Coin",
    6,
    coin("6319/large/usdc.png?1696506694"),
  ),
  sampleToken(8453, "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", "DEGEN", "Degen", 18, null),
  sampleToken(
    1,
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "USDC",
    "USD Coin",
    6,
    coin("6319/large/usdc.png?1696506694"),
  ),
  sampleToken(
    1,
    "0x0000000000000000000000000000000000000000",
    "ETH",
    "Ether",
    18,
    coin("279/large/ethereum.png?1696501628"),
  ),
  sampleToken(
    42161,
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "USDC",
    "USD Coin",
    6,
    coin("6319/large/usdc.png?1696506694"),
  ),
  sampleToken(
    137,
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    "USDC",
    "USD Coin",
    6,
    coin("6319/large/usdc.png?1696506694"),
  ),
  sampleToken(
    56,
    "0x55d398326f99059ff775485246999027b3197955",
    "USDT",
    "Tether",
    18,
    coin("325/large/Tether.png?1696501661"),
  ),
];

/** The same search the server does, so the panel behaves as it will in production. */
const sampleTokens = (path: string) => {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const chainId = params.get("chainId");
  const tokens = SAMPLE_TOKENS.filter(
    (t) =>
      (chainId === null || t.chainId === Number(chainId)) &&
      (q.length === 0 ||
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.chainName.toLowerCase().includes(q)),
  );
  return { tokens };
};

export const sampleResponse = (path: string, body?: string): unknown | undefined => {
  const route = path.split("?")[0] ?? path;
  if (route === "/v1/portfolio") return portfolio;
  if (route === "/v1/money") return money;
  if (route === "/v1/borrow") return borrow;
  if (route === "/v1/quote") return quote(body);
  const basket = basketRoute(route);
  if (basket !== undefined) return basket;
  if (route.startsWith("/v1/portfolio/exposure/"))
    return exposure(decodeURIComponent(route.split("/").at(-1) ?? ""));
  if (route === "/v1/baskets") return { baskets };
  if (route === "/v1/activity") return { items: [], nextCursor: null };
  if (route === "/v1/money/fund/sources") return { chains: SAMPLE_CHAINS, minimumUsd: "10" };
  if (route === "/v1/money/fund/tokens") return sampleTokens(path);
  if (route === "/v1/money/fund/intents") return { intents: [] };
  if (route === "/v1/portfolio/history") {
    const range = new URLSearchParams(path.split("?")[1] ?? "").get("range") ?? "1D";
    return { range, points: SAMPLE_HISTORY[range] ?? SAMPLE_HISTORY["1D"] };
  }
  return undefined;
};
