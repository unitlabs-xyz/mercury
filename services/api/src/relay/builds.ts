import { createHash } from "node:crypto";

/**
 * The messages this server composed, so the relayer signs nothing else.
 *
 * The alternative is to take a transaction from the client and read it back —
 * find the USDC transfer, decode its amount, derive the destination, check it
 * against a fee recomputed at a different moment. Every one of those steps is
 * a place to be wrong, and being wrong means a hot key pays for something we
 * did not agree to.
 *
 * Remembering instead makes the question exact. The buyer cannot drop the
 * charge, lower it, or redirect it, because any of those produce different
 * bytes and a signature covers every byte.
 *
 * It is memory, not a database, and the API runs as one process — the
 * background jobs live inside it, so a second instance is already ruled out.
 * A build that outlives the process is a build whose blockhash has expired
 * anyway.
 */
export interface SponsoredBuilds {
  /** Called when the server hands a sponsored transaction to the buyer. */
  remember(messageBytes: Uint8Array): void;
  /** Called before the relayer signs. */
  recognises(messageBytes: Uint8Array): boolean;
  readonly size: number;
}

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("base64");

/**
 * `ttlMs` outlives a blockhash on purpose. Roughly 60 to 90 seconds of
 * validity, and a buyer who takes longer than that to press approve has a
 * transaction the network will reject for its own reasons — better that than
 * this refusing it for ours, which would read as a bug in the relayer.
 */
export const inMemoryBuilds = (
  opts: { readonly ttlMs?: number; readonly now?: () => number } = {},
): SponsoredBuilds => {
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const seen = new Map<string, number>();

  const prune = (at: number): void => {
    for (const [key, expires] of seen) if (expires <= at) seen.delete(key);
  };

  return {
    remember(messageBytes) {
      const at = now();
      prune(at);
      seen.set(digest(messageBytes), at + ttlMs);
    },
    recognises(messageBytes) {
      const at = now();
      prune(at);
      return seen.has(digest(messageBytes));
    },
    get size() {
      prune(now());
      return seen.size;
    },
  };
};
