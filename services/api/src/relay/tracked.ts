import { createHash } from "node:crypto";
import { logger } from "../log/index.js";

const log = logger("tracked-sends");

/**
 * Transactions the server built, recorded by the server itself once they go out.
 *
 * Every transaction reaches the network through `/v1/transactions/send`, so the
 * server sees each one. An app's confirm is not like that: a tab that closes
 * after sending, or a person who switches wallets, never confirms, and a buy
 * or a loan with no record is money that moved with nothing in the books. The
 * confirm stays as the fast path; recording is idempotent on the signature, so
 * the two never write a thing twice.
 *
 * What was built is remembered by the bytes of its message, so only a
 * transaction exactly as built is ever recorded under what was built for it.
 * Memory, like `relay/builds.ts` and for the same reason: the API is one
 * process, and a build that outlives it has an expired blockhash anyway.
 */
export interface TrackedSends<T> {
  /** When a transaction is handed out to sign. */
  remember(messageBytes: Uint8Array, item: T): void;
  /** When the node accepts a transaction. One of ours is recorded once it can be read; anything else is ignored. Never throws. */
  accepted(messageBytes: Uint8Array, signature: string): Promise<void>;
}

/** What one attempt to record came to. */
export type Attempt = "recorded" | "pending" | "refused";

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("base64");

/**
 * How long to wait before each read. A transaction is readable a second or
 * two after it confirms, and its blockhash lets it land for about ninety
 * seconds, so the tries span that and stop.
 */
const WAITS = [2_000, 3_000, 5_000, 10_000, 20_000, 30_000, 30_000] as const;

export const trackedSends = <T>(
  what: string,
  attempt: (item: T, signature: string) => Promise<Attempt>,
  opts: {
    readonly waits?: readonly number[];
    readonly sleep?: (ms: number) => Promise<void>;
    /** Outlives a blockhash, as the build record does. */
    readonly ttlMs?: number;
    readonly now?: () => number;
  } = {},
): TrackedSends<T> => {
  const waits = opts.waits ?? WAITS;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const built = new Map<string, { item: T; expires: number }>();

  const prune = (at: number) => {
    for (const [key, b] of built) if (b.expires <= at) built.delete(key);
  };

  return {
    remember(messageBytes, item) {
      const at = now();
      prune(at);
      built.set(digest(messageBytes), { item, expires: at + ttlMs });
    },

    async accepted(messageBytes, signature) {
      prune(now());
      const key = digest(messageBytes);
      const found = built.get(key);
      if (found === undefined) return;
      // Once: the same bytes sent again are the same transaction.
      built.delete(key);
      for (const wait of waits) {
        await sleep(wait);
        const result = await attempt(found.item, signature).catch((error: unknown): Attempt => {
          log.warn({ what, signature, err: String(error) }, "could not record a sent transaction yet");
          return "pending";
        });
        if (result === "recorded") return;
        if (result === "refused") {
          log.warn({ what, signature }, "a sent transaction was not recorded");
          return;
        }
      }
      log.error(
        { what, signature },
        "a sent transaction never became readable; the app's confirm is all that is left",
      );
    },
  };
};
