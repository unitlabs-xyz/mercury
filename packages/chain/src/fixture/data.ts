import type { Issuer } from "@harbor/core";

/**
 * Measured on Solana mainnet on 19 September 2026, a Saturday with the US market shut.
 * Price per share and price impact for a $1,000 order. See docs/01.
 *
 * These drive the fixture adapters so the API runs end to end with no keys and no
 * network, which is what lets the web app be built before the integrations land.
 */
export interface FixtureToken {
  readonly mint: string;
  readonly symbol: string;
  readonly ticker: string;
  readonly name: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly multiplier: string;
  /** Price of one real share, as measured. */
  readonly pricePerShare: string;
  /** Ratio, not percent. 0.8527 is the 85% impact we measured on Ondo's Nvidia. */
  readonly priceImpact: string;
  readonly route: string;
  readonly referencePricePerShare: string;
}

export const FIXTURE_TOKENS: readonly FixtureToken[] = [
  { mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", symbol: "NVDAx", ticker: "NVDA", name: "NVIDIA", issuer: "backed", decimals: 8,
    multiplier: "1.001701196801074", pricePerShare: "222.33", priceImpact: "0.0002", route: "Riptide", referencePricePerShare: "222.365" },
  { mint: "NVDAon1111111111111111111111111111111111111", symbol: "NVDAon", ticker: "NVDA", name: "NVIDIA", issuer: "ondo", decimals: 18,
    multiplier: "1.0017152487959898", pricePerShare: "1523.66", priceImpact: "0.8527", route: "Manifest", referencePricePerShare: "222.365" },

  { mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", symbol: "SPYx", ticker: "SPY", name: "S&P 500 ETF", issuer: "backed", decimals: 8,
    multiplier: "1.005715", pricePerShare: "764.21", priceImpact: "0.0000", route: "Raydium CLMM", referencePricePerShare: "764.065" },
  { mint: "SPYon11111111111111111111111111111111111111", symbol: "SPYon", ticker: "SPY", name: "S&P 500 ETF", issuer: "ondo", decimals: 18,
    multiplier: "1.009473", pricePerShare: "765.03", priceImpact: "0.0010", route: "Meteora DLMM", referencePricePerShare: "764.065" },

  { mint: "XsWcQ4gLKTCCYuHhsNRnFY9nFCtrPPUpuk1XRNcgPPC", symbol: "QQQx", ticker: "QQQ", name: "Nasdaq 100 ETF", issuer: "backed", decimals: 8,
    multiplier: "1.002725", pricePerShare: "721.07", priceImpact: "0.0011", route: "Riptide", referencePricePerShare: "721.475" },
  { mint: "QQQon11111111111111111111111111111111111111", symbol: "QQQon", ticker: "QQQ", name: "Nasdaq 100 ETF", issuer: "ondo", decimals: 18,
    multiplier: "1.003353", pricePerShare: "2884.48", priceImpact: "0.7564", route: "Manifest", referencePricePerShare: "721.475" },

  { mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", symbol: "TSLAx", ticker: "TSLA", name: "Tesla", issuer: "backed", decimals: 8,
    multiplier: "1", pricePerShare: "364.86", priceImpact: "0.0002", route: "Riptide", referencePricePerShare: "365.205" },
  { mint: "TSLAon1111111111111111111111111111111111111", symbol: "TSLAon", ticker: "TSLA", name: "Tesla", issuer: "ondo", decimals: 18,
    multiplier: "1", pricePerShare: "14054.51", priceImpact: "0.9741", route: "Manifest", referencePricePerShare: "365.205" },

  { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPLx", ticker: "AAPL", name: "Apple", issuer: "backed", decimals: 8,
    multiplier: "1.003269", pricePerShare: "335.97", priceImpact: "0.0027", route: "Byreal", referencePricePerShare: "335.495" },
  { mint: "AAPLon111111111111111111111111111111111111", symbol: "AAPLon", ticker: "AAPL", name: "Apple", issuer: "ondo", decimals: 18,
    multiplier: "1.003376", pricePerShare: "395.28", priceImpact: "0.1318", route: "Meteora DLMM", referencePricePerShare: "335.495" },

  { mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", symbol: "MSTRx", ticker: "MSTR", name: "Strategy", issuer: "backed", decimals: 8,
    multiplier: "1", pricePerShare: "159.52", priceImpact: "0.0019", route: "Riptide", referencePricePerShare: "159.60" },
];

export const FIXTURE_SECTORS: Readonly<Record<string, string>> = {
  NVDA: "Semiconductors", AAPL: "Technology", TSLA: "Consumer", MSTR: "Financials",
  SPY: "Index", QQQ: "Index",
};
