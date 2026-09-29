import { defaultFetch } from "../fetch.js";

interface Pending {
  readonly method: string;
  readonly params: readonly unknown[];
  readonly resolve: (value: never) => void;
  readonly reject: (error: Error) => void;
}

interface RpcError {
  readonly code?: number;
  readonly message?: string;
}

interface RpcReply {
  readonly id?: number;
  readonly error?: RpcError;
  readonly result?: unknown;
}

export interface BatchConfig {
  readonly rpcUrl: string;
  readonly fetch?: typeof fetch;
  /**
   * Most calls in one HTTP request. A batch is all-or-nothing when the request
   * itself fails, so this is the blast radius as much as it is a limit — and
   * large batches are processed serially by the node, which costs latency a
   * few parallel requests would not.
   */
  readonly maxBatch?: number;
  /** Attempts for a request that failed as a whole. */
  readonly attempts?: number;
  /**
   * How long to keep collecting before sending. The default holds a batch open
   * only for the current microtask, which costs nothing: callers that issue
   * their requests together are batched, and a caller waiting alone is not
   * delayed at all. A millisecond figure is for a producer that trickles.
   */
  readonly windowMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One JSON-RPC call, made as part of whatever else is in flight.
 *
 * Callers ask for a single method and are answered individually. Underneath,
 * everything queued before the next flush leaves in one HTTP request.
 *
 * This exists because the node counts what it is asked, and being asked once
 * for fifty things is cheaper than fifty times for one. Measured against
 * Alchemy: a thousand calls as a thousand requests took 3.8 seconds, lost 324
 * to dropped connections and had 40 refused outright; the same thousand in two
 * requests took 0.6 seconds and were refused none.
 *
 * Two kinds of failure, and they are not the same:
 *
 * - **One entry fails.** The reply carries a result for some ids and an error
 *   for others, and only the caller that asked for the failing one hears about
 *   it. Verified against Alchemy: an invalid parameter and an unknown method
 *   came back as errors beside three results, under HTTP 200.
 * - **The request fails.** A 429, a 5xx or a dropped connection takes every
 *   call in the batch with it. Those are retried together, with backoff, and
 *   only then handed to their callers — which is the whole reason to put
 *   retries here rather than in each of the readers above.
 *
 * Replies are matched by id and never by position: JSON-RPC permits a server
 * to answer in any order, and the one that does would otherwise hand every
 * caller somebody else's balance.
 */
export const batchedRpc = (
  config: BatchConfig,
): (<T>(method: string, params: readonly unknown[]) => Promise<T>) => {
  const doFetch = config.fetch ?? defaultFetch();
  const maxBatch = config.maxBatch ?? 25;
  const attempts = config.attempts ?? 3;
  const sleep = config.sleep ?? pause;

  let queue: Pending[] = [];
  let scheduled = false;

  const send = async (batch: readonly Pending[]): Promise<void> => {
    // A lone call goes as a plain object, which is what every node expects and
    // what this client sent before batching existed.
    const body =
      batch.length === 1 && batch[0] !== undefined
        ? { jsonrpc: "2.0", id: 0, method: batch[0].method, params: batch[0].params }
        : batch.map((p, id) => ({ jsonrpc: "2.0", id, method: p.method, params: p.params }));

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(200 * 2 ** (attempt - 1));

      let replies: readonly RpcReply[];
      try {
        const res = await doFetch(config.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          lastError = new Error(`solana ${batch[0]?.method ?? "batch"} returned ${res.status}`);
          if (RETRYABLE(res.status)) continue;
          break;
        }
        const parsed: unknown = await res.json();
        replies = Array.isArray(parsed) ? (parsed as RpcReply[]) : [parsed as RpcReply];
      } catch (error: unknown) {
        // A dropped connection is the failure too many parallel requests
        // produces, and the one batching exists to avoid.
        lastError = error instanceof Error ? error : new Error("solana request failed");
        continue;
      }

      /*
       * Matched by id, never by position: JSON-RPC permits a server to answer
       * in any order, and the one that does would otherwise hand every caller
       * somebody else's balance.
       *
       * A lone call is the exception. There is nothing to confuse it with, and
       * nodes echo an id of their own choosing on a non-batched request — so
       * the single reply is the answer whatever it calls itself.
       */
      const byId = new Map<number, RpcReply>();
      if (batch.length === 1) {
        const only = replies[0];
        if (only !== undefined) byId.set(0, only);
      } else {
        for (const [i, reply] of replies.entries()) byId.set(reply.id ?? i, reply);
      }

      // A node that refuses the batch answers every entry with the same code.
      const everyEntryRateLimited =
        replies.length > 0 && replies.every((r) => r.error?.code === 429 || r.error?.code === -32029);
      if (everyEntryRateLimited && attempt < attempts - 1) {
        lastError = new Error(`solana ${batch[0]?.method ?? "batch"} returned 429`);
        continue;
      }

      batch.forEach((p, id) => {
        const reply = byId.get(id);
        if (reply === undefined) p.reject(new Error(`solana ${p.method} returned no result`));
        else if (reply.error !== undefined) p.reject(new Error(`solana ${p.method}: ${reply.error.message}`));
        else if (reply.result === undefined) p.reject(new Error(`solana ${p.method} returned no result`));
        else p.resolve(reply.result as never);
      });
      return;
    }

    const failure = lastError ?? new Error("solana request failed");
    for (const p of batch) p.reject(failure);
  };

  const flush = () => {
    scheduled = false;
    const taken = queue;
    queue = [];
    for (let i = 0; i < taken.length; i += maxBatch) void send(taken.slice(i, i + maxBatch));
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if (config.windowMs !== undefined && config.windowMs > 0) setTimeout(flush, config.windowMs);
    else queueMicrotask(flush);
  };

  return <T>(method: string, params: readonly unknown[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push({ method, params, resolve: resolve as (v: never) => void, reject });
      schedule();
    });
};
