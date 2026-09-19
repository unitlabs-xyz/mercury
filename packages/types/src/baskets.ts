import { z } from "zod";
import { Iso, Ratio, Ticker, Usd } from "./primitives.js";
import { Decision } from "./orders.js";

export const BasketConstituent = z.object({
  ticker: Ticker,
  name: z.string(),
  weightBps: z.number().int().min(1).max(10_000),
  currentWeightBps: z.number().int().min(0).max(10_000).nullable(),
});

export const Basket = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  feeBps: z.number().int().min(0),
  minimumUsd: Usd,
  navPerToken: Usd.nullable(),
  performance12mPct: Ratio.nullable(),
  capUsd: Usd.nullable(),
  constituents: z.array(BasketConstituent),
  venue: z.literal("symmetry"),
});

export const BasketPreview = z.object({
  legs: z.array(z.object({ ticker: Ticker, usdAmount: Usd, decision: Decision })),
  overall: z.enum(["executable", "partial", "refused"]),
  refusedLegs: z.array(Ticker),
});

export const InvestBasketRequest = z.object({ usdAmount: Usd, acceptQueued: z.boolean().default(false) });

export const PlanCadence = z.enum(["weekly", "monthly"]);
export const PlanAllocation = z.object({
  targetKind: z.enum(["instrument", "basket"]),
  targetId: z.string(),
  weightBps: z.number().int().min(1).max(10_000),
});
export const Plan = z.object({
  id: z.string().uuid(),
  usdAmount: Usd,
  cadence: PlanCadence,
  nextRunAt: Iso,
  status: z.enum(["active", "paused"]),
  allocations: z.array(PlanAllocation),
});

export type Basket = z.infer<typeof Basket>;
export type BasketPreview = z.infer<typeof BasketPreview>;
export type Plan = z.infer<typeof Plan>;
