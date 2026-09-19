/**
 * Dummy data for building the interface. It mirrors the wire shapes in `@harbor/types`
 * exactly, so swapping it for the real client is a change of import and nothing else.
 *
 * Prices are the ones measured on Solana mainnet on 19 September 2026. See docs/01.
 * This file is deleted the week the API is wired. It never ships to production.
 */

export type Issuer = "backed" | "ondo";
export type InstrumentStatus = "open" | "premarket" | "postmarket" | "overnight" | "closed" | "halted" | "stale" | "corp_action_pending";

export interface Wrapper {
  mint: string;
  symbol: string;
  issuer: Issuer;
  multiplier: string;
  pricePerShare: string;
  priceImpact: string;
  route: string;
  routable: boolean;
}

export interface Instrument {
  ticker: string;
  name: string;
  sector: string;
  pricePerShare: string;
  changePct24h: number;
  wrappers: Wrapper[];
  about: string;
}

const w = (
  symbol: string, issuer: Issuer, multiplier: string, pricePerShare: string,
  priceImpact: string, route: string,
): Wrapper => ({
  mint: `${symbol}-mint`, symbol, issuer, multiplier, pricePerShare, priceImpact, route,
  routable: Number(priceImpact) <= 0.015,
});

export const INSTRUMENTS: Instrument[] = [
  {
    ticker: "NVDA", name: "NVIDIA", sector: "Semiconductors", pricePerShare: "222.365", changePct24h: 0.0119,
    about: "Designs the graphics and accelerated computing chips that most of the world's AI runs on.",
    wrappers: [
      w("NVDAx", "backed", "1.001701", "222.33", "0.0002", "Riptide"),
      w("NVDAon", "ondo", "1.001715", "1523.66", "0.8527", "Manifest"),
    ],
  },
  {
    ticker: "SPY", name: "S&P 500 ETF", sector: "Index", pricePerShare: "764.065", changePct24h: 0.0032,
    about: "The five hundred largest companies listed in the United States, in one fund.",
    wrappers: [
      w("SPYx", "backed", "1.005715", "764.21", "0.0000", "Raydium"),
      w("SPYon", "ondo", "1.009473", "765.03", "0.0010", "Meteora"),
    ],
  },
  {
    ticker: "QQQ", name: "Nasdaq 100 ETF", sector: "Index", pricePerShare: "721.475", changePct24h: 0.0047,
    about: "The hundred largest non-financial companies on the Nasdaq. Technology heavy by design.",
    wrappers: [
      w("QQQx", "backed", "1.002725", "721.07", "0.0011", "Riptide"),
      w("QQQon", "ondo", "1.003353", "2884.48", "0.7564", "Manifest"),
    ],
  },
  {
    ticker: "TSLA", name: "Tesla", sector: "Consumer", pricePerShare: "365.205", changePct24h: -0.0208,
    about: "Electric vehicles, energy storage, and an unusually large amount of narrative.",
    wrappers: [
      w("TSLAx", "backed", "1.000000", "364.86", "0.0002", "Riptide"),
      w("TSLAon", "ondo", "1.000000", "14054.51", "0.9741", "Manifest"),
    ],
  },
  {
    ticker: "AAPL", name: "Apple", sector: "Technology", pricePerShare: "335.495", changePct24h: 0.0061,
    about: "Phones, computers, and the services people buy because they already own the phone.",
    wrappers: [
      w("AAPLx", "backed", "1.003269", "335.97", "0.0027", "Byreal"),
      w("AAPLon", "ondo", "1.003376", "395.28", "0.1318", "Meteora"),
    ],
  },
  {
    // Trading rich because the float is tight and nobody can mint more while the market
    // is shut. This is the real failure mode: on another chain a tokenized HIMS once
    // traded at four and a half times its share price for exactly this reason.
    ticker: "MSTR", name: "Strategy", sector: "Financials", pricePerShare: "159.60", changePct24h: -0.0341,
    about: "A software company that became a way to own bitcoin through the stock market.",
    wrappers: [w("MSTRx", "backed", "1.000000", "162.47", "0.0019", "Riptide")],
  },
];

export const findInstrument = (ticker: string): Instrument | undefined =>
  INSTRUMENTS.find((i) => i.ticker === ticker.toUpperCase());

export interface Basket {
  slug: string;
  name: string;
  tagline: string;
  feeBps: number;
  minimumUsd: number;
  capUsd: number | null;
  performance12m: number;
  constituents: { ticker: string; name: string; weightBps: number; currentWeightBps: number }[];
}

export const BASKETS: Basket[] = [
  {
    slug: "core-us", name: "Core US",
    tagline: "The whole US market, tilted toward technology.",
    feeBps: 0, minimumUsd: 25, capUsd: 5000, performance12m: 0.142,
    constituents: [
      { ticker: "SPY", name: "S&P 500", weightBps: 7000, currentWeightBps: 6940 },
      { ticker: "QQQ", name: "Nasdaq 100", weightBps: 3000, currentWeightBps: 3060 },
    ],
  },
  {
    slug: "ai-and-semis", name: "AI & Semiconductors",
    tagline: "The companies that build the machines everything else runs on.",
    feeBps: 50, minimumUsd: 25, capUsd: 5000, performance12m: 0.184,
    constituents: [
      { ticker: "NVDA", name: "NVIDIA", weightBps: 4000, currentWeightBps: 4180 },
      { ticker: "AAPL", name: "Apple", weightBps: 3500, currentWeightBps: 3390 },
      { ticker: "MSTR", name: "Strategy", weightBps: 2500, currentWeightBps: 2430 },
    ],
  },
];

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  valueUsd: number;
  costBasisUsd: number;
  changePct24h: number;
  wrapperCount: number;
  kind: "stock" | "basket";
  slug?: string;
}

export const HOLDINGS: Holding[] = [
  { ticker: "NVDA", name: "NVIDIA", shares: 2.398, valueUsd: 533.28, costBasisUsd: 496.10, changePct24h: 0.0119, wrapperCount: 2, kind: "stock" },
  { ticker: "CORE-US", name: "Core US", shares: 1.201, valueUsd: 865.94, costBasisUsd: 840.00, changePct24h: 0.0038, wrapperCount: 1, kind: "basket", slug: "core-us" },
  { ticker: "AAPL", name: "Apple", shares: 1.044, valueUsd: 350.26, costBasisUsd: 361.80, changePct24h: 0.0061, wrapperCount: 1, kind: "stock" },
  { ticker: "TSLA", name: "Tesla", shares: 0.412, valueUsd: 150.46, costBasisUsd: 158.20, changePct24h: -0.0208, wrapperCount: 1, kind: "stock" },
];

export const CASH_USD = 1543.38;
export const YIELD_APR = 0.048;
export const INTEREST_YTD = 31.4;

export const PORTFOLIO_SERIES = [
  100, 101.2, 100.6, 102.4, 104.1, 103.2, 105.8, 107.1, 106.2, 108.9, 110.4, 109.1,
  111.8, 113.2, 112.1, 114.7, 116.2, 115.4, 117.9, 119.1, 118.2, 120.6, 122.1, 121.3,
];

export interface ExposureRow {
  symbol: string; issuer: Issuer; multiplier: string; shares: number; valueUsd: number; sharePct: number;
}

export const NVDA_EXPOSURE: ExposureRow[] = [
  { symbol: "NVDAx", issuer: "backed", multiplier: "1.001701", shares: 1.7985, valueUsd: 400.0, sharePct: 75 },
  { symbol: "NVDAon", issuer: "ondo", multiplier: "1.001715", shares: 0.5995, valueUsd: 133.28, sharePct: 25 },
];

export type ActivityKind = "buy" | "sell" | "basket" | "dividend" | "receive" | "queued";

export interface ActivityItem {
  id: string; kind: ActivityKind; title: string; subtitle: string;
  amountUsd: number | null; at: string; signature: string | null;
}

export const ACTIVITY: ActivityItem[] = [
  { id: "1", kind: "queued", title: "Queued S&P 500", subtitle: "Waiting for $764.07 · fills Monday", amountUsd: -200, at: "2026-09-19T17:04:00Z", signature: null },
  { id: "2", kind: "dividend", title: "Dividend reinvested", subtitle: "NVIDIA · 2.398 → 2.401 shares", amountUsd: null, at: "2026-09-18T20:11:00Z", signature: "5REh2Dxu" },
  { id: "3", kind: "buy", title: "Bought NVIDIA", subtitle: "via Backed · 0.449 shares at $222.33", amountUsd: -100, at: "2026-09-17T14:22:00Z", signature: "4i7Y6BEd" },
  { id: "4", kind: "basket", title: "Invested in Core US", subtitle: "$175 S&P 500 · $75 Nasdaq 100", amountUsd: -250, at: "2026-09-15T09:40:00Z", signature: "8kPq2Lms" },
  { id: "5", kind: "receive", title: "Received USDC", subtitle: "From an external wallet", amountUsd: 2000, at: "2026-09-14T11:02:00Z", signature: "2nBvC9xz" },
];

export const MARKET: { status: InstrumentStatus; isOpen: boolean; isWeekend: boolean; nextOpenAt: string } = {
  status: "closed", isOpen: false, isWeekend: true, nextOpenAt: "2026-09-21T13:30:00Z",
};
