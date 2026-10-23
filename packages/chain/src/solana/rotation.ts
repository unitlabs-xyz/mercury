import { defaultFetch } from "../fetch.js";

/**
 * RPC endpoints taken in turn.
 *
 * For the background jobs, over free public endpoints. Each one answers a
 * modest rate and refuses past it, so one alone refuses the jobs; taken in
 * turn, the load spreads, and one that refuses rests while the others carry
 * on. Measured on 22 October 2026: the jobs on one paid plan were refused
 * every call for the first minute after a deploy.
 */
export interface Rotation {
  readonly urls: readonly string[];
  /**
   * The next URL that is not resting for `method`, in turn. Null while every
   * one is. Rests are per method: public endpoints refuse some methods and
   * serve the rest (PublicNode refuses getTokenAccountsByOwner, 22 October
   * 2026), and resting one for everything would waste what it can carry.
   */
  next(method?: string): string | null;
  /** It refused `method` or failed: rest it for that, twice as long each time it does so again in a row. */
  refused(url: string, method?: string): void;
  /** It answered `method`: back in turn for it at once, its refusals forgotten. */
  served(url: string, method?: string): void;
  /** One request found every URL refusing, the fallback too. Tells `onStrain`. */
  strained(): void;
  /** When `strained` last happened, by the rotation's clock; 0 for never. What a job backs off on. */
  readonly strainedAt: number;
  /** Resolves when the next request may go out, `perSecond` apart. At once without a pace. */
  wait(): Promise<void>;
  /** The same for the fallback, `fallbackPerSecond` apart. */
  waitFallback(): Promise<void>;
  /** Where a request goes when every URL refuses it, if anywhere. Never rested. */
  readonly fallback: string | null;
}

export interface RotationConfig {
  readonly now?: () => number;
  /** The first rest. Two seconds: past the one-second windows rate limits count in. */
  readonly restMs?: number;
  /** The longest rest. Five minutes: an endpoint that never serves a method is asked again that often. */
  readonly maxRestMs?: number;
  /**
   * Methods an endpoint is known not to serve, by URL, so it is never asked
   * for them. Solana Vibe Station keeps only recent history, and answers an
   * older signature cursor with "Transaction … not found" (22 October 2026).
   */
  readonly skips?: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Requests a second across the rotation, spaced evenly. Unset, no pacing.
   * Public endpoints count per second and per ten; a job's first pass after
   * boot read seventeen wallets at once and was refused nearly all of it.
   */
  readonly perSecond?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Where a request goes when every URL refuses it: the paid endpoint, so the
   * jobs do not fail what free endpoints will not carry. Measured 22 October
   * 2026, Solana's public endpoint refused one transaction read in five even at
   * two a second, and the only other keyless one keeps no history.
   */
  readonly fallback?: string;
  /**
   * Requests a second to the fallback, spaced evenly. Unset, no pacing.
   *
   * The fallback is the paid endpoint the app's own routes use. Unpaced, a
   * job's eight workers that every free endpoint refused arrived there at once
   * and were refused too, and the routes with them (23 October 2026).
   */
  readonly fallbackPerSecond?: number;
  /** Told each time a request found every URL and the fallback refusing: what a job backs off on. */
  readonly onStrain?: () => void;
}

export const rotation = (urls: readonly string[], config: RotationConfig = {}): Rotation => {
  if (urls.length === 0) throw new Error("a rotation needs at least one URL");
  const now = config.now ?? Date.now;
  const restMs = config.restMs ?? 2_000;
  const maxRestMs = config.maxRestMs ?? 5 * 60_000;
  const resting = new Map<string, { readonly until: number; readonly streak: number }>();
  let turn = 0;
  let strainedAt = 0;
  let nextSlot = 0;
  let nextFallbackSlot = 0;
  const key = (url: string, method = "") => `${url} ${method}`;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const skipped = (url: string, method?: string) =>
    method !== undefined && (config.skips?.get(url)?.has(method) ?? false);

  return {
    urls,
    fallback: config.fallback ?? null,
    next(method) {
      const at = now();
      for (let i = 0; i < urls.length; i++) {
        const url = urls[(turn + i) % urls.length]!;
        if (skipped(url, method)) continue;
        const rest = resting.get(key(url, method));
        if (rest === undefined || rest.until <= at) {
          turn = (turn + i + 1) % urls.length;
          return url;
        }
      }
      return null;
    },
    refused(url, method) {
      const streak = (resting.get(key(url, method))?.streak ?? 0) + 1;
      resting.set(key(url, method), {
        streak,
        until: now() + Math.min(maxRestMs, restMs * 2 ** (streak - 1)),
      });
    },
    served(url, method) {
      resting.delete(key(url, method));
    },
    strained() {
      strainedAt = now();
      config.onStrain?.();
    },
    get strainedAt() {
      return strainedAt;
    },
    async wait() {
      if (config.perSecond === undefined || config.perSecond <= 0) return;
      const at = now();
      const slot = Math.max(at, nextSlot);
      nextSlot = slot + 1000 / config.perSecond;
      if (slot > at) await sleep(slot - at);
    },
    async waitFallback() {
      if (config.fallbackPerSecond === undefined || config.fallbackPerSecond <= 0) return;
      const at = now();
      const slot = Math.max(at, nextFallbackSlot);
      nextFallbackSlot = slot + 1000 / config.fallbackPerSecond;
      if (slot > at) await sleep(slot - at);
    },
  };
};

/**
 * Words an endpoint uses when it refuses a request it answered with a 200:
 * PublicNode's "Request blocked", dRPC's "chain is not available on free plan",
 * Pocket's "Method not found", LeoRPC's "Internal JSON-RPC error" for a method
 * it does not serve, Solana Vibe Station's "Transaction … not found" for a
 * cursor older than the history it keeps, Solana's own "Failed to query
 * long-term storage; please try again" when its history store has a moment,
 * and the rate limits some put in the body instead of the status. Measured 22
 * and 23 October 2026.
 */
const REFUSAL =
  /blocked|not available|upgrade|rate limit|too many requests|limit exceeded|method not found|not supported|does not exist|internal json-rpc error|transaction \S+ not found|long-term storage/i;

/** An endpoint's error message that means it refused the call, not that the call was wrong. */
export const isRefusalMessage = (message: string): boolean => REFUSAL.test(message);

/** What a request asks for, for resting per method. */
const methodOf = (init?: RequestInit): string | undefined => {
  try {
    const parsed = JSON.parse(String(init?.body ?? "")) as { method?: unknown };
    return typeof parsed?.method === "string" ? parsed.method : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The answer is a refusal in words like those: the endpoint refused the
 * request. The call's own error, a bad parameter say, is not this, and is
 * passed back as it is.
 */
const refusedInside = async (res: Response): Promise<boolean> => {
  try {
    const reply = (await res.clone().json()) as { error?: { message?: unknown } };
    return REFUSAL.test(String(reply?.error?.message ?? ""));
  } catch {
    return false;
  }
};

/**
 * `fetch` over a rotation, for `SolanaRpc`. The URL it is called with is
 * ignored: each request goes to the rotation's next URL for its method, and
 * one that refuses passes the same request on to the next at once. Anything
 * but a 2xx is a refusal, and so is a 200 that refuses in the words above.
 * When every one refuses, the fallback is asked, at its own pace, if there is
 * one; when that refuses too, the refusal is the answer, so the caller above
 * backs off and asks again as it does for a single endpoint.
 */
export const rotatingFetch =
  (r: Rotation, doFetch: typeof fetch = defaultFetch()): typeof fetch =>
  async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const method = methodOf(init);
    let refusal: Response | null = null;
    let failure: unknown = null;
    for (let i = 0; i < r.urls.length; i++) {
      const url = r.next(method);
      if (url === null) break;
      await r.wait();
      try {
        const res = await doFetch(url, init);
        if (res.ok && !(await refusedInside(res))) {
          r.served(url, method);
          return res;
        }
        r.refused(url, method);
        void refusal?.body?.cancel();
        refusal = res;
      } catch (error: unknown) {
        // A dropped connection, the failure too many requests at once produce.
        r.refused(url, method);
        failure = error;
      }
    }
    if (r.fallback !== null) {
      await r.waitFallback();
      try {
        const res = await doFetch(r.fallback, init);
        if (res.ok && !(await refusedInside(res))) return res;
        void refusal?.body?.cancel();
        refusal = res;
      } catch (error: unknown) {
        failure = error;
      }
    }
    r.strained();
    if (refusal !== null) return refusal;
    if (failure !== null) throw failure;
    return new Response(null, { status: 429, statusText: "every endpoint is resting" });
  };
