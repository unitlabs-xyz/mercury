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
  /** The next URL that is not resting, in turn. Null while every one is. */
  next(): string | null;
  /** It refused or failed: rest it, twice as long each time it does so again in a row. */
  refused(url: string): void;
  /** It answered: back in turn at once, its refusals forgotten. */
  served(url: string): void;
  /** One request found every URL refusing. */
  strained(): void;
  /** When `strained` last happened, by the rotation's clock; 0 for never. What a job backs off on. */
  readonly strainedAt: number;
}

export interface RotationConfig {
  readonly now?: () => number;
  /** The first rest. Two seconds: past the one-second windows rate limits count in. */
  readonly restMs?: number;
  /** The longest rest. */
  readonly maxRestMs?: number;
}

export const rotation = (urls: readonly string[], config: RotationConfig = {}): Rotation => {
  if (urls.length === 0) throw new Error("a rotation needs at least one URL");
  const now = config.now ?? Date.now;
  const restMs = config.restMs ?? 2_000;
  const maxRestMs = config.maxRestMs ?? 60_000;
  const resting = new Map<string, { readonly until: number; readonly streak: number }>();
  let turn = 0;
  let strainedAt = 0;

  return {
    urls,
    next() {
      const at = now();
      for (let i = 0; i < urls.length; i++) {
        const url = urls[(turn + i) % urls.length]!;
        const rest = resting.get(url);
        if (rest === undefined || rest.until <= at) {
          turn = (turn + i + 1) % urls.length;
          return url;
        }
      }
      return null;
    },
    refused(url) {
      const streak = (resting.get(url)?.streak ?? 0) + 1;
      resting.set(url, { streak, until: now() + Math.min(maxRestMs, restMs * 2 ** (streak - 1)) });
    },
    served(url) {
      resting.delete(url);
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
 * A refusal worth another endpoint: rate limited, broken, or refusing the
 * method. Public nodes answer a method they do not serve with 403.
 */
const REFUSED = (status: number) => status === 429 || status === 403 || status >= 500;

/**
 * `fetch` over a rotation, for `SolanaRpc`. The URL it is called with is
 * ignored: each request goes to the rotation's next URL, and one that refuses
 * passes the same request on to the next at once. When every one refuses, the
 * refusal is the answer, so the batching above backs off and asks again as it
 * already does for a single endpoint.
 */
export const rotatingFetch =
  (r: Rotation, doFetch: typeof fetch = defaultFetch()): typeof fetch =>
  async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    let refusal: Response | null = null;
    let failure: unknown = null;
    for (let i = 0; i < r.urls.length; i++) {
      const url = r.next();
      if (url === null) break;
      try {
        const res = await doFetch(url, init);
        if (!REFUSED(res.status)) {
          r.served(url);
          return res;
        }
        r.refused(url);
        void refusal?.body?.cancel();
        refusal = res;
      } catch (error: unknown) {
        // A dropped connection, the failure too many requests at once produce.
        r.refused(url);
        failure = error;
      }
    }
    r.strained();
    if (refusal !== null) return refusal;
    if (failure !== null) throw failure;
    return new Response(null, { status: 429, statusText: "every endpoint is resting" });
  };
