import { createHash } from "node:crypto";
import type { ChainHistory } from "@mercury/chain";
import { logger } from "../log/index.js";
import type { MoveRecord } from "./record.js";

const log = logger("moves");

/** A move as it was built: everything `recordMove` needs but the signature and the time it landed. */
export type BuiltMove = Omit<MoveRecord, "signature" | "occurredAt">;

/**
 * Moves the server built, so it records each one itself when the relayer
 * sends it. Every move goes out through `/v1/transactions/send`, so the
 * server sees each one; nothing waits on the page staying open.
 *
 * The books are written only once the node says the transaction succeeded,
 * at the time it landed: a move whose blockhash expired, or that failed, moved
 * nothing. Memory, like `relay/builds.ts`: the API is one process, and a build
 * that outlives it has an expired blockhash anyway.
 */
export interface MoveSends {
  /** When a move's transaction is handed out to sign. */
  remember(messageBytes: Uint8Array, move: BuiltMove): void;
  /** When the node accepts a transaction. One of ours is recorded once it can be read. Never throws. */
  accepted(messageBytes: Uint8Array, signature: string): Promise<void>;
}

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("base64");

/** The same waits as an Earn move: a transaction is readable a second or two after it confirms. */
const WAITS = [2_000, 3_000, 5_000, 10_000, 20_000, 30_000, 30_000] as const;

export const moveSends = (
  deps: {
    readonly history: Pick<ChainHistory, "transaction">;
    readonly record: (move: MoveRecord) => Promise<unknown>;
  },
  opts: {
    readonly waits?: readonly number[];
    readonly sleep?: (ms: number) => Promise<void>;
    readonly ttlMs?: number;
    readonly now?: () => number;
  } = {},
): MoveSends => {
  const waits = opts.waits ?? WAITS;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const moves = new Map<string, { move: BuiltMove; expires: number }>();

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
        const tx = await deps.history.transaction(signature).catch(() => null);
        if (tx === null) continue;
        if (!tx.succeeded) {
          log.warn({ signature }, "a move failed on chain; nothing moved, so nothing is recorded");
          return;
        }
        const occurredAt = tx.blockTime === null ? new Date(now()) : new Date(tx.blockTime * 1000);
        try {
          await deps.record({ ...found.move, signature, occurredAt });
        } catch (error) {
          log.error({ signature, err: String(error) }, "a move landed but could not be recorded");
        }
        return;
      }
      log.error(
        { signature, from: found.move.fromWalletId },
        "a move never became readable; position-sync will see the tokens leave and arrive without their cost",
      );
    },
  };
};
