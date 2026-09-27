import { z } from "zod";
import { Iso, Issuer, InstrumentStatus, Mint, Ratio, Ticker, Usd } from "./primitives.js";

export const Wrapper = z.object({
  mint: Mint,
  symbol: z.string(),
  issuer: Issuer,
  multiplier: Usd,
  decimals: z.number().int().min(0).max(18),
  isRoutable: z.boolean(),
  icon: z.string().nullable(),
  /** Pool depth on Jupiter, USD. Zero means no pool at all. */
  liquidityUsd: Usd,
  holders: z.number().int().min(0),
  volume24hUsd: Usd,
  netBuyers24h: z.number().int(),
  traders24h: z.number().int().min(0),
});

export const Instrument = z.object({
  ticker: Ticker,
  name: z.string(),
  sector: z.string().nullable(),
  logoUrl: z.string().url().nullable(),
  pricePerShare: Usd,
  changePct24h: Ratio,
  status: InstrumentStatus,
  /** On the short shelf a first visit sees. Everything else is found by search. */
  featured: z.boolean(),
  /** Across every wrapper. */
  liquidityUsd: Usd,
  /** About the largest order the deepest pool takes inside the impact cap. An estimate; the quote decides. */
  maxOrderUsd: Usd,
  holders: z.number().int().min(0),
  volume24hUsd: Usd,
  netBuyers24h: z.number().int(),
  traders24h: z.number().int().min(0),
  wrappers: z.array(Wrapper),
});

export const MarketStatus = z.object({
  status: InstrumentStatus,
  isOpen: z.boolean(),
  nextOpenAt: Iso.nullable(),
  nextCloseAt: Iso.nullable(),
  isWeekend: z.boolean(),
});

export const Shelf = z.enum(["popular", "movers", "sector"]);

export type Wrapper = z.infer<typeof Wrapper>;
export type Instrument = z.infer<typeof Instrument>;
export type MarketStatus = z.infer<typeof MarketStatus>;
