import { defaultFetch } from "../fetch.js";

interface RpcReply {
  readonly error?: { readonly code?: number; readonly message?: string };
  readonly result?: unknown;
}

export interface CallConfig {
  readonly rpcUrl: string;
  readonly fetch?: typeof fetch;
  /** Attempts for a call that failed as a whole. Four: one try and three retries. */
  readonly attempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** For the jitter; tests pin it. */
  readonly random?: () => number;
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;

/** A node that rate-limits in the body rather than the status. */
const RATE_LIMITED = (code: number | undefined) => code === 429 || code === -32029;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * How long to wait before retry `n` (1-based).
 *
 * A rate limit gets seconds, everything else milliseconds. Alchemy refuses
 * `getSignaturesForAddress` past a per-second budget and says nothing about
 * when to come back — no `Retry-After` — so a retry 200ms later lands in the
 * same second and is refused again. Measured 6 October 2026: at one call a
 * second, about half were refused. A dropped connection or a 5xx is a
 * different failure, and the short wait still suits it.
 */
const backoffMs = (n: number, rateLimited: boolean, random: () => number): number =>
  // Jittered between half and the full wait, so callers refused together do not all retry together.
  (rateLimited ? 1_000 : 200) * 2 ** (n - 1) * (0.5 + random() / 2);

/**
 * One JSON-RPC call per HTTP request, and one request for calls that are the
 * same.
 *
 * Calls used to leave together as a JSON-RPC batch. That saved round trips and
 * nothing else: a provider bills every call in a batch at its own price
 * (Alchemy's compute-unit table, October 2026), the free endpoints the jobs
 * read refuse batches outright, and one 429 sent all twenty-five back again.
 * What does save calls is not asking twice: a call identical to one still in
 * flight — same method, same parameters — waits for that one's answer. A
 * portfolio and a money request polled together read the wallet's token
 * accounts once.
 *
 * A 429, a 5xx or a dropped connection is retried here, with backoff, so every
 * reader above gets the same treatment. An error the node gives for the call
 * itself is the caller's, as is.
 */
export const rpcCall = (
  config: CallConfig,
): (<T>(method: string, params: readonly unknown[]) => Promise<T>) => {
  const doFetch = config.fetch ?? defaultFetch();
  const attempts = config.attempts ?? 4;
  const sleep = config.sleep ?? pause;
  const random = config.random ?? Math.random;
  const inFlight = new Map<string, Promise<unknown>>();

  const send = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 0, method, params });
    let lastError: Error | null = null;
    let rateLimited = false;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt, rateLimited, random));
      rateLimited = false;

      let reply: RpcReply;
      try {
        const res = await doFetch(config.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (!res.ok) {
          lastError = new Error(`solana ${method} returned ${res.status}`);
          rateLimited = res.status === 429;
          if (RETRYABLE(res.status)) continue;
          break;
        }
        reply = (await res.json()) as RpcReply;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error("solana request failed");
        continue;
      }

      if (RATE_LIMITED(reply.error?.code) && attempt < attempts - 1) {
        lastError = new Error(`solana ${method} returned 429`);
        rateLimited = true;
        continue;
      }
      if (reply.error !== undefined) throw new Error(`solana ${method}: ${reply.error.message}`);
      if (reply.result === undefined) throw new Error(`solana ${method} returned no result`);
      return reply.result;
    }

    throw lastError ?? new Error("solana request failed");
  };

  return <T>(method: string, params: readonly unknown[]): Promise<T> => {
    const key = `${method} ${JSON.stringify(params)}`;
    const pending = inFlight.get(key);
    if (pending !== undefined) return pending as Promise<T>;
    const call = send(method, params).finally(() => inFlight.delete(key));
    inFlight.set(key, call);
    return call as Promise<T>;
  };
};
