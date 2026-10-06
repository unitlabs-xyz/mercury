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

/** A Glider template creates a user-owned portfolio; it is not a pooled token. */
export const ManagedBasketTag = z.enum([
  "theme:technology",
  "theme:energy",
  "theme:defense",
  "theme:consumer",
  "theme:finance",
  "theme:hard-assets",
  "theme:healthcare",
  "shelf:pros",
  "shelf:featured",
]);

export const ManagedBasketTemplate = z.object({
  slug: z.string(),
  kind: z.literal("managed_portfolio"),
  provider: z.literal("glider"),
  status: z.enum(["candidate", "disabled", "enabled"]),
  tags: z.array(ManagedBasketTag),
  canEnroll: z.boolean(),
  name: z.string(),
  description: z.string(),
  strategyId: z.string().nullable(),
  sourceStrategyId: z.string(),
  schedule: z.object({ type: z.literal("interval"), frequency: z.literal("daily") }),
  allocations: z.array(
    z.object({
      ticker: z.string(),
      mint: z.string(),
      assetId: z.string(),
      weightBps: z.number().int().min(1).max(10_000),
    }),
  ),
  performance: z
    .object({
      basis: z.literal("modeled_strategy_twr"),
      asOf: z.string(),
      points: z.array(z.object({ date: z.string(), percentChange: z.string() })),
      windows: z.array(
        z.object({
          window: z.enum(["1d", "1w", "1m", "3m", "6m", "12m", "all"]),
          percentChange: z.string(),
          since: z.string(),
        }),
      ),
    })
    .nullable(),
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
export type ManagedBasketTag = z.infer<typeof ManagedBasketTag>;
export type ManagedBasketTemplate = z.infer<typeof ManagedBasketTemplate>;
export type BasketPreview = z.infer<typeof BasketPreview>;
export type Plan = z.infer<typeof Plan>;
