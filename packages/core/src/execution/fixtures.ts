import { D, fromPct } from "../money.js";
import type { Candidate, DecisionInput, ReferencePrice } from "./types.js";
import { DEFAULT_POLICY } from "./policy.js";

export const NOW = new Date("2026-09-19T18:00:00Z");

export const quote = (inAmount: number, outAmount: number, impactPct: number, label = "Riptide") => ({
  inAmount: D(inAmount),
  outAmount: D(outAmount),
  priceImpact: fromPct(D(impactPct)),
  routeLabels: [label],
  quoteId: `q-${label}-${outAmount}`,
  expiresAt: new Date(NOW.getTime() + 30_000),
});

export const reference = (pricePerShare: number, pendingDividendNet = 0, ageSec = 5): ReferencePrice => ({
  pricePerShare: D(pricePerShare),
  observedAt: new Date(NOW.getTime() - ageSec * 1000),
  pendingDividendNet: D(pendingDividendNet),
});

/**
 * Measured on Solana mainnet, 19 September 2026, $1,000 buy. See docs/01.
 * Backed routes at 0.02% impact. Ondo moves the price 85% for the same stock.
 */
export const NVDA_CANDIDATES: Candidate[] = [
  {
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    symbol: "NVDAx",
    issuer: "backed",
    multiplier: D("1.001701196801074"),
    quote: quote(1000, 4.490180, 0.02),
  },
  {
    mint: "NVDAonMintAddress11111111111111111111111111",
    symbol: "NVDAon",
    issuer: "ondo",
    multiplier: D("1.0017152487959898"),
    quote: quote(1000, 0.655191, 85.27, "Manifest"),
  },
];

/**
 * The case that justifies the multiplier correction. Both issuers are deep, and their
 * multipliers differ by 0.37%, which is larger than the gap in their prices.
 */
export const SPY_CANDIDATES: Candidate[] = [
  {
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    symbol: "SPYx",
    issuer: "backed",
    multiplier: D("1.005715"),
    quote: quote(1000, 1.301105, 0.0, "Raydium CLMM"),
  },
  {
    mint: "SPYonMintAddress111111111111111111111111111",
    symbol: "SPYon",
    issuer: "ondo",
    multiplier: D("1.009473"),
    quote: quote(1000, 1.294872, 0.1, "Meteora DLMM"),
  },
];

export const buyInput = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  ticker: "NVDA",
  side: "buy",
  amount: D(1000),
  candidates: NVDA_CANDIDATES,
  reference: reference(222.365),
  status: "open",
  policy: DEFAULT_POLICY,
  now: NOW,
  ...over,
});
