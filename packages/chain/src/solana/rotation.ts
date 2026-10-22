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
  /** One request found every URL refusing. */
  strained(): void;
  /** When `strained` last happened, by the rotation's clock; 0 for never. What a job backs off on. */
  readonly strainedAt: number;
}

export interface RotationConfig {
  readonly now?: () => number;
  /** The first rest. Two seconds: past the one-second windows rate limits count in. */
  readonly restMs?: number;
  /** The longest rest. Five minutes: an endpoint that never serves a method is asked again that often. */
  readonly maxRestMs?: number;
}

export const rotation = (urls: readonly string[], config: RotationConfig = {}): Rotation => {
  if (urls.length === 0) throw new Error("a rotation needs at least one URL");
  const now = config.now ?? Date.now;
  const restMs = config.restMs ?? 2_000;
  const maxRestMs = config.maxRestMs ?? 5 * 60_000;
  const resting = new Map<string, { readonly until: number; readonly streak: number }>();
  let turn = 0;
  let strainedAt = 0;
  const key = (url: string, method = "") => `${url} ${method}`;

  return {
    urls,
    next(method) {
      const at = now();
      for (let i = 0; i < urls.length; i++) {
        const url = urls[(turn + i) % urls.length]!;
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
    },
    get strainedAt() {
      return strainedAt;
    },
  };
};

/**
 * Words an endpoint uses when it refuses a request it answered with a 200:
 * PublicNode's "Request blocked", dRPC's "chain is not available on free plan",
 * Pocket's "Method not found", LeoRPC's "Internal JSON-RPC error" for a method
 * it does not serve, and the rate limits some put in the body instead of the
 * status. Measured 22 October 2026.
 */
const REFUSAL =
  /blocked|not available|upgrade|rate limit|too many requests|limit exceeded|method not found|not supported|does not exist|internal json-rpc error/i;

/** An endpoint's error message that means it refused the call, not that the call was wrong. */
export const isRefusalMessage = (message: string): boolean => REFUSAL.test(message);

/** What a request asks for, for resting per method: the method, or every method of a batch. */
const methodOf = (init?: RequestInit): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(String(init?.body ?? ""));
    const calls = (Array.isArray(parsed) ? parsed : [parsed]) as { method?: unknown }[];
    const methods = [...new Set(calls.map((c) => String(c?.method ?? "")))].sort();
    return Array.isArray(parsed) ? `batch:${methods.join(",")}` : methods[0];
  } catch {
    return undefined;
  }
};

/**
 * Every call in the answer refused in words like those: the endpoint refused
 * the request, not the calls. One call's own error, a bad parameter say, is
 * not this, and is passed back as it is.
 */
const refusedInside = async (res: Response): Promise<boolean> => {
  try {
    const parsed: unknown = await res.clone().json();
    const replies = (Array.isArray(parsed) ? parsed : [parsed]) as { error?: { message?: unknown } }[];
    return replies.length > 0 && replies.every((r) => REFUSAL.test(String(r?.error?.message ?? "")));
  } catch {
    return false;
  }
};

/**
 * `fetch` over a rotation, for `SolanaRpc`. The URL it is called with is
 * ignored: each request goes to the rotation's next URL for its method, and
 * one that refuses passes the same request on to the next at once. Anything
 * but a 2xx is a refusal, and so is a 200 whose every call is refused in the
 * words above. When every one refuses, the refusal is the answer, so the
 * batching above backs off and asks again as it does for a single endpoint.
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
    r.strained();
    if (refusal !== null) return refusal;
    if (failure !== null) throw failure;
    return new Response(null, { status: 429, statusText: "every endpoint is resting" });
  };
