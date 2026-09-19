import { D, fromPct } from "../money.js";
import type { ExecutionPolicy } from "./types.js";

/**
 * Defaults are argued in docs/04. Measured weekend drift on 19 Sep 2026 was under
 * 15 basis points across five large tokens, so a 100 basis point tolerance only
 * fires on real dislocation rather than on noise.
 */
export const DEFAULT_POLICY: ExecutionPolicy = {
  maxPriceImpact: fromPct(D(1.5)),
  premiumTolerance: fromPct(D(1)),
  maxReferenceAgeSecOpen: 120,
  maxReferenceAgeSecClosed: 900,
  minOrderUsd: D(5),
  blockOnCorpActionPending: true,
};

export const withPolicy = (overrides: Partial<ExecutionPolicy>): ExecutionPolicy => ({
  ...DEFAULT_POLICY,
  ...overrides,
});
