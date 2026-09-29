import { z } from "zod";

export const ErrorCode = z.enum([
  "unauthorized",
  "not_found",
  "validation_failed",
  "rate_limited",
  "quote_expired",
  /** The price moved against the user between confirming and building. */
  "price_moved",
  "instrument_not_tradable",
  "upstream_unavailable",
  "internal",
]);

export const ApiError = z.object({
  error: z.object({ code: ErrorCode, message: z.string(), details: z.unknown().optional() }),
});

export type ErrorCode = z.infer<typeof ErrorCode>;
export type ApiError = z.infer<typeof ApiError>;
