import type { ChainHistory, SignaturePage } from "@mercury/chain";

/**
 * The history reader's share of the paid RPC, and how it gives way.
 *
 * The reader shares one allowance with everything the app does, and on 23
 * October that allowance ran out and every route that reads the chain
 * answered 429 until it had room again. So the reader's rate is a hard
 * ceiling, well under the plan's limit, and it is the first to step back:
 *
 * - calls are spaced evenly at `rps` a second (2 by default, `HISTORY_RPC_RPS`);
 * - a refusal (429) stops it for a minute, then it resumes at half the rate,
 *   down to a floor, so the app's reads and trades always win;
 * - after a run of calls with no refusal it climbs back, doubling, to `rps`.
 *
 * Its clock and its sleep are injected, so none of this needs real time to test.
 */
export interface Budget {
  /** Wait for this call's turn. Throws `RateLimited` while stopped after a refusal. */
  take(): Promise<void>;
  /** The node refused a call: stop for a minute, then go at half the rate. */
  refused(): void;
  /** A call went through: count toward climbing back. */
  answered(): void;
  /** The rate now, in calls a second; for a log line. */
  rate(): number;
}

/** How long the reader stops after a refusal. */
export const REFUSAL_PAUSE_MS = 60_000;
/** The slowest it goes: one call every eight seconds. */
export const MIN_RPS = 0.125;
/** Calls with no refusal before the rate doubles back toward its ceiling. */
export const CLIMB_AFTER = 120;

/** The reader stopped for a refusal: this pass gives way and its job is tried again later. */
export class RateLimited extends Error {
  constructor() {
    super("history reader paused after the node refused a call");
    this.name = "RateLimited";
  }
}

export const budget = (opts: {
  readonly rps: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}): Budget => {
  const ceiling = Math.max(MIN_RPS, opts.rps);
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let rps = ceiling;
  let nextAt = 0;
  let pausedUntil = 0;
  let clean = 0;

  return {
    async take() {
      const at = now();
      if (at < pausedUntil) throw new RateLimited();
      // Reserve the slot before waiting, so calls made together queue rather than collide.
      const slot = Math.max(at, nextAt);
      nextAt = slot + 1000 / rps;
      if (slot > at) await sleep(slot - at);
    },
    refused() {
      pausedUntil = now() + REFUSAL_PAUSE_MS;
      rps = Math.max(MIN_RPS, rps / 2);
      clean = 0;
      nextAt = pausedUntil;
    },
    answered() {
      clean += 1;
      if (clean >= CLIMB_AFTER && rps < ceiling) {
        rps = Math.min(ceiling, rps * 2);
        clean = 0;
      }
    },
    rate: () => rps,
  };
};

/** Whether an error from the chain client is a rate limit, by what `rpcCall` says on a 429. */
export const isRateLimit = (error: unknown): boolean =>
  error instanceof Error && /returned 429\b|-32029|rate limit|too many requests/i.test(error.message);

/**
 * The chain's history, read through the budget: every call waits its turn,
 * and a refusal stops the reader rather than being retried at it. The client
 * underneath is built with retries off, so the budget alone decides when to
 * ask again.
 */
export const budgeted = (history: ChainHistory, b: Budget): ChainHistory => {
  /** `cost` is how many RPC calls the method makes: a token account listing asks both token programs. */
  const paced = async <T>(call: () => Promise<T>, cost = 1): Promise<T> => {
    for (let i = 0; i < cost; i++) await b.take();
    try {
      const out = await call();
      b.answered();
      return out;
    } catch (error: unknown) {
      if (isRateLimit(error)) {
        b.refused();
        throw new RateLimited();
      }
      throw error;
    }
  };
  return {
    tokenAccountsFor: (owner, mint) => paced(() => history.tokenAccountsFor(owner, mint)),
    ...(history.tokenAccounts
      ? { tokenAccounts: (owner: string) => paced(() => history.tokenAccounts!(owner), 2) }
      : {}),
    ...(history.ownedTokenAccounts
      ? { ownedTokenAccounts: (owner: string) => paced(() => history.ownedTokenAccounts!(owner), 2) }
      : {}),
    signatures: (address: string, page: SignaturePage) => paced(() => history.signatures(address, page)),
    transaction: (signature: string) => paced(() => history.transaction(signature)),
  };
};
