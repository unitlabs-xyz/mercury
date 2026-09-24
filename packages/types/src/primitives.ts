import { z } from "zod";

/**
 * Money crosses the wire as a decimal string, never a number.
 * A JavaScript number cannot represent 0.1 and will silently lose money. See docs/05.
 */
export const Usd = z.string().regex(/^-?\d+(\.\d+)?$/, "expected a decimal string");
export const Qty = Usd;
/** A ratio, not a percentage. "0.0085" is 85 basis points. */
export const Ratio = z.string().regex(/^-?\d+(\.\d+)?$/);

export const Mint = z.string().min(32).max(44);
export const Ticker = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[A-Z.]+$/);
export const Issuer = z.enum(["backed", "ondo"]);
export const Side = z.enum(["buy", "sell"]);

export const InstrumentStatus = z.enum([
  "open",
  "premarket",
  "postmarket",
  "overnight",
  "closed",
  "halted",
  "stale",
  "corp_action_pending",
]);

export const Iso = z.string().datetime();

export type Issuer = z.infer<typeof Issuer>;
export type Side = z.infer<typeof Side>;
export type InstrumentStatus = z.infer<typeof InstrumentStatus>;
