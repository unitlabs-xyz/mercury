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
  totalValueUsd: Usd,
  cashUsd: Usd,
  changeUsd: Usd,
  changePct: Ratio,
  holdings: z.array(Holding),
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
export type Exposure = z.infer<typeof Exposure>;
export type Money = z.infer<typeof Money>;
