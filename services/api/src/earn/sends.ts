import { createHash } from "node:crypto";
import { logger } from "../log/index.js";
import type { EarnMove, Recorded } from "./record.js";

export type { EarnMove } from "./record.js";

const log = logger("earn");

/**
 * Earn moves the server built, so it can record each one itself when the
 * transaction goes out, instead of trusting the app to confirm it.
 *
 * Every Earn transaction reaches the network through `/v1/transactions/send`,
 * so the server sees each one. The app's confirm is not like that: a tab that
 * closes after sending and before the answer comes back never confirms, and a
 * deposit missing from the ledger reads as that much "earned so far". The
 * confirm stays, as the fast path; recording is idempotent on the signature,
 * so the two never write a move twice.
 *
 * Memory, like `relay/builds.ts`, and for the same reason: the API is one
 * process, and a build that outlives it has an expired blockhash anyway.
 */
export interface EarnSends {
  /** When a move's transaction is handed out to sign. */
  remember(messageBytes: Uint8Array, move: EarnMove): void;
  /**
   * When the node accepts a transaction. One of ours is recorded once it can
   * be read; anything else is ignored. Never throws.
   */
  accepted(messageBytes: Uint8Array, signature: string): Promise<void>;
}

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("base64");

/**
 * How long to wait before each read. A transaction is readable a second or
 * two after it confirms, and its blockhash lets it land for about ninety
 * seconds, so the tries span that and stop.
 */
const WAITS = [2_000, 3_000, 5_000, 10_000, 20_000, 30_000, 30_000] as const;

export const earnSends = (
  record: (move: EarnMove & { readonly signature: string }) => Promise<Recorded>,
  opts: {
    readonly waits?: readonly number[];
    readonly sleep?: (ms: number) => Promise<void>;
    /** Outlives a blockhash, as the build record does. */
    readonly ttlMs?: number;
    readonly now?: () => number;
  } = {},
): EarnSends => {
  const waits = opts.waits ?? WAITS;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const moves = new Map<string, { move: EarnMove; expires: number }>();

  const prune = (at: number) => {
    for (const [key, m] of moves) if (m.expires <= at) moves.delete(key);
  };

  return {
    remember(messageBytes, move) {
      const at = now();
      prune(at);
      moves.set(digest(messageBytes), { move, expires: at + ttlMs });
    },

    async accepted(messageBytes, signature) {
      prune(now());
      const key = digest(messageBytes);
      const found = moves.get(key);
      if (found === undefined) return;
      // Once: the same bytes sent again are the same transaction.
      moves.delete(key);
      for (const wait of waits) {
        await sleep(wait);
        const result = await record({ ...found.move, signature }).catch((error: unknown) => {
          log.warn({ signature, err: String(error) }, "could not read an Earn move yet");
          return { kind: "pending" } as const;
        });
        if (result.kind === "recorded") return;
        if (result.kind === "refused") {
          log.warn({ signature, code: result.code, detail: result.message }, "an Earn move was not recorded");
          return;
        }
      }
      log.error(
        { signature, ...found.move },
        "an Earn move never became readable; the app's confirm is all that is left",
      );
    },
  };
};
