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
 * 300s cleared that interval, then stopped clearing it: measured again on
 * 9 October 2026 the republish gap was 155s median and 221s at worst, and one
 * reading in 77 was already past 300s during the regular session. Chasing the
 * feed with a bigger number is what this file did last time.
 *
 * So 300s and 900s no longer refuse anything. They are the point past which the
 * reference is treated as uncertain and `premiumTolerance` widens with its age,
 * up to `referenceStaleMaxWidenBps`; `deadReferenceAgeSec*` is where it is
 * abandoned. The ages above were the argument for that: the issuer's feed
 * freezes at the closing bell — on 9 October 2026 the quote stopped advancing
 * at 20:00 UTC and its age grew without bound — so any minutes-long bar refuses
 * every order from shortly after the close until the next session, including
 * sells. xStocks trade around the clock and the shares behind them do not; no
 * feed can make a Saturday price exist, so the only correct response to an old
 * reference out of hours is to widen the band, not to shut the door.
 *
 * Four days of `deadReferenceAgeSecClosed` clears a long weekend, but not by
 * much, and the margin is worth writing down rather than rediscovering. An
 * ordinary weekend is 65.5 hours, Friday's 20:00 UTC close to Monday's 13:30
 * open. A Monday holiday — Presidents' Day, Memorial Day, Labor Day, MLK —
 * stretches that to 89.5 hours against a 96-hour bar, so about six and a half
 * hours spare. Both ends are pinned in `decide.test.ts`; anything that moves
 * this number should move that test first.
 *
 * An hour of `deadReferenceAgeSecOpen` is tighter on purpose: while the market
 * trades, an hour-old price is genuinely behind rather than merely closed.
 *
 * A reference that updates in seconds is still worth having, and `PythReference`
 * now reads one. It does not replace any of the above — Pyth's equity feeds
 * close with the exchange too.
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
  deadReferenceAgeSecOpen: 3_600,
  deadReferenceAgeSecClosed: 345_600,
  referenceStaleMaxWidenBps: 100,
  minOrderUsd: D(5),
  blockOnCorpActionPending: true,
};

export const withPolicy = (overrides: Partial<ExecutionPolicy>): ExecutionPolicy => ({
  ...DEFAULT_POLICY,
  ...overrides,
});
