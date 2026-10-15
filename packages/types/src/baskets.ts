import { z } from "zod";

export const BasketTag = z.enum([
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
export type BasketTag = z.infer<typeof BasketTag>;

const BasketAllocation = z.object({
  ticker: z.string(),
  mint: z.string(),
  assetId: z.string(),
  weightBps: z.number().int().min(1).max(10_000),
});

/** Glider's modeled return for the strategy, not what any one owner earned. */
const BasketPerformance = z.object({
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
});

const shared = {
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  /** Null until Glider holds a strategy for it; nothing can be funded before then. */
  strategyId: z.string().nullable(),
  schedule: z.object({ type: z.literal("interval"), frequency: z.literal("daily") }),
  allocations: z.array(BasketAllocation),
  performance: BasketPerformance.nullable(),
};

/**
 * A basket, from the shelf or from its author.
 *
 * Split on `source` rather than carrying both halves' fields, because they
 * genuinely differ: a curated basket is shelved under themes, and one
 * somebody wrote has no themes but is theirs to edit and delete. Anything
 * rendering that difference reads this; a flat shape would have left it
 * inferring ownership from a null.
 */
export const Basket = z.discriminatedUnion("source", [
  z.object({ source: z.literal("curated"), tags: z.array(BasketTag), ...shared }),
  z.object({ source: z.literal("mine"), createdAt: z.string(), updatedAt: z.string(), ...shared }),
]);
export type Basket = z.infer<typeof Basket>;

/**
 * A basket as somebody composed it. Bounds here are abuse guards only: the
 * real rules answer with their own codes, so the client can say which broke.
 */
const DraftAsset = z.object({
  assetId: z.string().min(1).max(200),
  weightBps: z.number().int().min(1).max(10_000),
});
export const CreateBasket = z.object({
  name: z.string().max(500),
  description: z.string().max(2000).default(""),
  assets: z.array(DraftAsset).max(200),
});

/** Every field optional, but not all of them at once. */
export const UpdateBasket = z
  .object({
    name: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
    assets: z.array(DraftAsset).max(200).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });

/**
 * One tokenised equity a basket may be written from.
 *
 * Narrower than the universe this product trades: Glider classifies xStocks as
 * crypto and will not hold them inside a strategy, so this is Ondo's equities
 * and nothing else.
 */
export const PickableBasketAsset = z.object({
  ticker: z.string(),
  name: z.string(),
  /** Both, as allocations carry both: the id a strategy holds it by, and the logo's key. */
  mint: z.string(),
  assetId: z.string(),
  logoUrl: z.string().nullable(),
});
export type PickableBasketAsset = z.infer<typeof PickableBasketAsset>;

/** Read-only provider facts about a strategy's target holdings, not a user's portfolio. */
export const BasketInsights = z.object({
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

export const BasketPortfolio = z.object({
  portfolioId: z.string(),
  ownerAccountId: z.string(),
  strategyId: z.string(),
  smartAccounts: z.array(z.object({ accountId: z.string(), depositAccountId: z.string().optional() })),
});

/** Live Glider account facts. Values are decimal strings, not basket-token units or P&L. */
export const BasketPortfolioSnapshot = BasketPortfolio.extend({
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
export type BasketPortfolioSnapshot = z.infer<typeof BasketPortfolioSnapshot>;

/** An owner-scoped landing-page summary; values describe the live smart account. */
export const BasketPortfolioSummary = z.object({
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
export type BasketPortfolioSummary = z.infer<typeof BasketPortfolioSummary>;

export const BasketOperation = z.object({
  operationId: z.string(),
  portfolioId: z.string(),
  kind: z.enum(["withdraw", "rebalance", "bridge", "swap", "deposit", "transfer", "execution", "converge"]),
  state: z.enum(["accepted", "running", "retrying", "awaiting_user", "completed", "failed", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type BasketOperation = z.infer<typeof BasketOperation>;

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
export const BasketExitSubmission = z.enum(["withdraw", "liquidate_all"]);
export type BasketExitSubmission = z.infer<typeof BasketExitSubmission>;
export const BasketExitAsset = z.object({
  assetId: z.string().min(1),
  amountRaw: z
    .string()
    .max(32)
    .regex(/^[1-9]\d*$/),
});
export type BasketExitAsset = z.infer<typeof BasketExitAsset>;
export const PrepareBasketExit = z.object({ assets: z.array(BasketExitAsset).min(1) });
export const BasketExitMessage = z.object({
  portfolioId: z.string().min(1),
  recipientAccountId: z.string().min(1),
  assets: z.array(BasketExitAsset).min(1),
  nonce: z.string().regex(/^0x[\da-fA-F]{64}$/),
  expiresAt: z.number().int().positive(),
  liquidate: z.boolean().optional(),
  settlementAssetId: z.string().optional(),
});
export type BasketExitMessage = z.infer<typeof BasketExitMessage>;
export const PreparedBasketExit = z.object({
  mode: BasketExitMode,
  submission: BasketExitSubmission,
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
  submission: BasketExitSubmission.optional(),
});
export const SubmittedBasketExit = TriggeredBasketRebalance.extend({ mode: BasketExitMode });
export type SubmittedBasketExit = z.infer<typeof SubmittedBasketExit>;
export const BasketActivity = z.object({
  id: z.string(),
  kind: z.string(),
  occurredAt: z.string(),
  title: z.string(),
  subtitle: z.string(),
  amountUsd: z.string().nullable(),
  tokenQuantity: z.string().nullable(),
  txSignature: z.string().nullable(),
});
export type BasketActivity = z.infer<typeof BasketActivity>;

export type BasketInsights = z.infer<typeof BasketInsights>;
export type BasketPortfolio = z.infer<typeof BasketPortfolio>;
export type PreparedBasketEnrollment = z.infer<typeof PreparedBasketEnrollment>;
