/**
 * Requests a second, on the Developer plan.
 *
 * Jupiter counts over a 60-second sliding window and the allowance is per
 * organisation, not per key — so rotating keys spreads nothing, and every
 * adapter sharing this fetch is spending one budget. Keyless is 30 a minute,
 * Free 60, Developer 600, Launch 3,000, Pro 9,000.
 */
export const JUPITER_RPS = 10;

export interface PaceConfig {
  readonly perSecond?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A fetch that holds a request back rather than letting it be refused.
 *
 * Retrying a 429 recovers from one; this stops it happening. The difference
 * matters because a refusal is not free even when it is retried — the refused
 * request still counted against the window that refused it, so a burst that
 * overruns the allowance spends its budget on answers nobody gets and pushes
 * the recovery further out. Waiting costs the same wall clock and nothing else.
 *
 * Admissions are chained rather than each reading the clock for itself: two
 * callers arriving together would otherwise both see room for one more and
 * both take it.
 *
 * It paces starts, which is what the limit counts, not how many are in flight.
 */
export const paced = (inner: typeof fetch, config: PaceConfig = {}): typeof fetch => {
  const limit = Math.max(1, Math.floor(config.perSecond ?? JUPITER_RPS));
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? pause;
  /** When each request in the current window started. At most `limit` of them. */
  const starts: number[] = [];
  let queue: Promise<void> = Promise.resolve();

  const admit = async (): Promise<void> => {
    for (;;) {
      const at = now();
      while (starts.length > 0 && at - starts[0]! >= 1_000) starts.shift();
      if (starts.length < limit) {
        starts.push(at);
        return;
      }
      // Exactly until the oldest start leaves the window, which is the soonest
      // there can be room. Sleeping longer would waste the allowance.
      await sleep(1_000 - (at - starts[0]!));
    }
  };

  return (input, init) => {
    const turn = queue.then(admit);
    // The queue must survive a failed admission, or one error would wedge every
    // later request behind a rejected promise.
    queue = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn.then(() => inner(input, init));
  };
};
