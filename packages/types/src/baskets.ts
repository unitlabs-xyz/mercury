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

/** Read-only provider facts about a strategy's target holdings, not a user's portfolio. */
export const ManagedBasketInsights = z.object({
  allocation: z
    .object({
      sectors: z.array(
        z.object({ label: z.string(), weightPercent: z.string(), holdingCount: z.number().int() }),
      ),
      themes: z.array(
        z.object({ label: z.string(), weightPercent: z.string(), holdingCount: z.number().int() }),
      ),
      unclassifiedCount: z.number().int(),
      lowConfidenceCount: z.number().int(),
    })
    .nullable(),
  integratorSwapFeeBps: z.number().int().nullable(),
});

export const ManagedBasketPortfolio = z.object({
  portfolioId: z.string(),
  ownerAccountId: z.string(),
  strategyId: z.string(),
  smartAccounts: z.array(z.object({ accountId: z.string(), depositAccountId: z.string().optional() })),
});

/** Live Glider account facts. Values are decimal strings, not basket-token units or P&L. */
export const ManagedBasketPortfolioSnapshot = ManagedBasketPortfolio.extend({
  schedule: z
    .object({
      status: z.enum(["active", "paused"]),
      frequency: z.enum(["hourly", "daily", "weekly", "monthly"]).nullable(),
      intervalMs: z.number().nullable(),
      nextDueAt: z.string().nullable(),
      lastRebalanceAt: z.string().nullable(),
    })
    .nullable(),
  totalValueUsd: z.string(),
  inTransitUsd: z.string(),
  fetchedAt: z.string(),
  assets: z.array(
    z.object({
      assetId: z.string(),
      smartAccountId: z.string(),
      symbol: z.string(),
      decimals: z.number().int(),
      balance: z.string(),
      balanceRaw: z.string(),
      priceUsd: z.string(),
      valueUsd: z.string(),
    }),
  ),
  warnings: z.array(
    z.object({
      kind: z.enum([
        "MISSING_SMART_ACCOUNT",
        "RPC_ERROR",
        "MISSING_PRICE",
        "BLOCKLISTED_ASSET",
        "MISSING_ASSET",
        "IN_TRANSIT_READ_FAILED",
      ]),
      message: z.string(),
    }),
  ),
});
export type ManagedBasketPortfolioSnapshot = z.infer<typeof ManagedBasketPortfolioSnapshot>;

/** An owner-scoped landing-page summary; values describe the live smart account. */
export const ManagedBasketPortfolioSummary = z.object({
  portfolioId: z.string(),
  strategyId: z.string(),
  slug: z.string(),
  name: z.string(),
  targetAssetCount: z.number().int(),
  totalValueUsd: z.string().nullable(),
  usdcBalance: z.string().nullable(),
  inTransitUsd: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  partial: z.boolean(),
});
export type ManagedBasketPortfolioSummary = z.infer<typeof ManagedBasketPortfolioSummary>;

export const ManagedBasketOperation = z.object({
  operationId: z.string(),
  portfolioId: z.string(),
  kind: z.enum(["withdraw", "rebalance", "bridge", "swap", "deposit", "transfer", "execution", "converge"]),
  state: z.enum(["accepted", "running", "retrying", "awaiting_user", "completed", "failed", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type ManagedBasketOperation = z.infer<typeof ManagedBasketOperation>;

export const TriggeredBasketRebalance = z.object({
  operationId: z.string().min(1),
  submittedAt: z.string(),
});
export type TriggeredBasketRebalance = z.infer<typeof TriggeredBasketRebalance>;

export const BasketEnrollmentAuthorization = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solana-message"), text: z.string() }),
  z.object({ kind: z.literal("solana-transaction"), transaction: z.string() }),
]);
export const PreparedBasketEnrollment = z.object({
  intentId: z.string().uuid(),
  authorization: BasketEnrollmentAuthorization,
});
export const SubmitBasketEnrollment = z.object({
  intentId: z.string().uuid(),
  signed: z.string().min(1).max(20_000),
});

export const PrepareBasketFunding = z.object({ amountUsd: z.string().min(1).max(16) });
export const PreparedBasketFunding = z.object({
  portfolioId: z.string(),
  destinationAccountId: z.string(),
  amountRaw: z.string(),
  transaction: z.string(),
  expiresAt: z.string(),
});
export type PreparedBasketFunding = z.infer<typeof PreparedBasketFunding>;
export const ConfirmBasketFunding = z.object({ signature: z.string().min(80).max(90) });
export const ConfirmedBasketFunding = z.object({
  portfolioId: z.string(),
  signature: z.string(),
  amountRaw: z.string(),
});
export const BasketExitMode = z.enum(["in_kind", "liquidate_usdc"]);
export type BasketExitMode = z.infer<typeof BasketExitMode>;
export const BasketExitMessage = z.object({
  portfolioId: z.string().min(1),
  recipientAccountId: z.string().min(1),
  assets: z.array(z.object({ assetId: z.string().min(1), amountRaw: z.string().regex(/^[1-9]\d*$/) })).min(1),
  nonce: z.string().regex(/^0x[\da-fA-F]{64}$/),
  expiresAt: z.number().int().positive(),
  liquidate: z.boolean().optional(),
  settlementAssetId: z.string().optional(),
});
export type BasketExitMessage = z.infer<typeof BasketExitMessage>;
export const PreparedBasketExit = z.object({
  mode: BasketExitMode,
  portfolioId: z.string(),
  recipientAccountId: z.string(),
  expiresAt: z.string(),
  authorization: z.object({ kind: z.literal("solana-message"), text: z.string() }),
  message: BasketExitMessage,
});
export type PreparedBasketExit = z.infer<typeof PreparedBasketExit>;
export const SubmitBasketExit = z.object({
  message: BasketExitMessage,
  signature: z.string().min(1).max(200),
});
export const SubmittedBasketExit = TriggeredBasketRebalance.extend({ mode: BasketExitMode });
export type SubmittedBasketExit = z.infer<typeof SubmittedBasketExit>;
export const ManagedBasketActivity = z.object({
  id: z.string(),
  kind: z.string(),
  occurredAt: z.string(),
  title: z.string(),
  subtitle: z.string(),
  amountUsd: z.string().nullable(),
  tokenQuantity: z.string().nullable(),
  txSignature: z.string().nullable(),
});
export type ManagedBasketActivity = z.infer<typeof ManagedBasketActivity>;

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
export type ManagedBasketInsights = z.infer<typeof ManagedBasketInsights>;
export type ManagedBasketPortfolio = z.infer<typeof ManagedBasketPortfolio>;
export type PreparedBasketEnrollment = z.infer<typeof PreparedBasketEnrollment>;
export type BasketPreview = z.infer<typeof BasketPreview>;
export type Plan = z.infer<typeof Plan>;
