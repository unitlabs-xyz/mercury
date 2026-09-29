import { D, fromPct } from "../money.js";
import type { ExecutionPolicy } from "./types.js";

/**
 * Defaults are argued in docs/04. Measured weekend drift on 19 Sep 2026 was under
 * 15 basis points across five large tokens, so a 100 basis point tolerance only
 * fires on real dislocation rather than on noise.
 *
 * `maxReferenceAgeSecOpen` was 120s, which was shorter than the feed behind it.
 * Jupiter's `stockData.updatedAt` advanced 137s between refreshes when measured
 * on 28 September 2026, so the quote went stale before it was replaced and the
 * product refused every order for the last seconds of each cycle — about one
 * minute in eight, for the life of the market session.
 *
 * 300s clears that interval with margin. It is a looser guarantee than 120s
 * pretended to offer, and it is one the data can actually keep; a freshness bar
 * no source can meet is not a safety property, it is a coin toss. The real fix
 * is a reference that updates in seconds — Pyth publishes equities
 * continuously, and ADR 0010's reason for not reading it (CORS) stopped
 * applying when pricing moved to the server.
 *
 * `slippageBps` lived in the Jupiter adapter as a hardcoded 50, which put half
 * of the 100 basis point premium tolerance outside the tolerance's own reach:
 * an order could clear the premium check by 40 basis points and still fill 50
 * worse, and no number on screen said so. It is policy, so it sits in policy,
 * and `worstPricePerShare` now carries the bound onto the screen. The value is
 * unchanged — the defect was the silence, not the size.
 *
 * `maxQuoteDriftBps` is the gap between "the market moved" and "this is not
 * what you agreed to". Execution re-quotes and re-decides before it builds, so
 * some drift is expected and healthy; 50 basis points of adverse movement in
 * the seconds between confirming and signing is not, and earns a second look
 * rather than a silent fill.
 */
export const DEFAULT_POLICY: ExecutionPolicy = {
  maxPriceImpact: fromPct(D(1.5)),
  premiumTolerance: fromPct(D(1)),
  slippageBps: 50,
  maxQuoteDriftBps: 50,
  maxReferenceAgeSecOpen: 300,
  maxReferenceAgeSecClosed: 900,
  minOrderUsd: D(5),
  blockOnCorpActionPending: true,
};

export const withPolicy = (overrides: Partial<ExecutionPolicy>): ExecutionPolicy => ({
  ...DEFAULT_POLICY,
  ...overrides,
});
