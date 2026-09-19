import { z } from "zod";
import { InstrumentStatus, Iso, Issuer, Mint, Ratio, Side, Ticker, Usd } from "./primitives.js";

export const CandidateRejection = z.enum(["no_route", "impact_too_high", "zero_output"]);

export const PricedCandidate = z.object({
  mint: Mint,
  symbol: z.string(),
  issuer: Issuer,
  multiplier: Usd,
  pricePerToken: Usd.nullable(),
  pricePerShare: Usd.nullable(),
  priceImpact: Ratio.nullable(),
  routeLabels: z.array(z.string()),
  viable: z.boolean(),
  rejection: CandidateRejection.nullable(),
});

export const RefuseReason = z.enum([
  "below_minimum", "no_route", "impact_too_high",
  "reference_stale", "instrument_halted", "corp_action_pending", "no_candidates",
]);

const decisionBase = {
  ticker: Ticker,
  side: Side,
  amount: Usd,
  fairPricePerShare: Usd,
  status: InstrumentStatus,
  candidates: z.array(PricedCandidate),
  decidedAt: Iso,
};

export const Decision = z.discriminatedUnion("kind", [
  z.object({ ...decisionBase, kind: z.literal("execute"), best: PricedCandidate, premium: Ratio, warning: z.string().nullable() }),
  z.object({
    ...decisionBase, kind: z.literal("offer_queue"), best: PricedCandidate, premium: Ratio,
    suggestedTriggerPricePerShare: Usd, marketOpensAt: Iso.nullable(),
  }),
  z.object({ ...decisionBase, kind: z.literal("refuse"), reason: RefuseReason, detail: z.string() }),
]);

export const OrderStatus = z.enum([
  "pending", "executing", "filled", "queued", "partially_filled", "expired", "cancelled", "refused",
]);

export const Order = z.object({
  id: z.string().uuid(),
  ticker: Ticker,
  side: Side,
  amount: Usd,
  status: OrderStatus,
  decision: Decision,
  chosenMint: Mint.nullable(),
  txSignature: z.string().nullable(),
  filledShares: Usd.nullable(),
  createdAt: Iso,
  filledAt: Iso.nullable(),
});

export const CreateOrderRequest = z.object({ ticker: Ticker, side: Side, amount: Usd });
export const CreateOrderResponse = z.object({ orderId: z.string().uuid(), decision: Decision });
export const UnsignedTxResponse = z.object({
  transactions: z.array(z.string()),
  expiresAt: Iso,
});
export const ConfirmOrderRequest = z.object({ signature: z.string() });

export type Decision = z.infer<typeof Decision>;
export type Order = z.infer<typeof Order>;
export type PricedCandidate = z.infer<typeof PricedCandidate>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;
