import { spot } from "./presence.js";

/** What decided which wallets a pass read before anything was pushed. */
export interface Polled {
  due(wallet: string): boolean;
  read(wallet: string): void;
}

export interface Pushed extends Polled {
  /** The node said something happened to this wallet. */
  changed(wallet: string): void;
  /** Where in the first sweep a wallet nobody has read yet is first due. */
  spotOf(wallet: string): number;
  /** Wallets remembered. For the test that this stays bounded. */
  size(): number;
}

export interface PushedOptions {
  /**
   * Whether the stream can be trusted right now. False — no socket, or one
   * that has missed something — and `blind` decides the pass instead.
   */
  readonly live: () => boolean;
  /**
   * What decides a pass with nothing streaming. Every wallet when left out,
   * which is what a job that polled everything did.
   */
  readonly blind?: Polled;
  /**
   * How often a wallet is read even though the node said nothing about it.
   *
   * The safety net, and the reason this is sound: a subscription is not a
   * guarantee. A notification dropped between the node and us leaves a wallet
   * behind for this long and no longer, which is the gap being bought with
   * a tenth of the reads.
   */
  readonly sweepMs?: number;
  readonly now?: () => number;
  /** Where in the first sweep a wallet is first due. A stable hash of the address when left out. */
  readonly spread?: (wallet: string) => number;
}

/**
 * Which wallets a pass reads when the chain pushes instead of being polled.
 *
 * A wallet is read because something happened to it, and otherwise once a
 * sweep. That is the whole saving: every per-wallet job was reading every
 * wallet on a timer in case something had, and nothing had, nearly every time.
 *
 * Three things keep it honest. A notice is not cleared until the wallet has
 * actually been read, so a pass that failed reads it again. News that arrives
 * while a pass is running survives that pass, so a deposit that lands
 * mid-read is not swallowed by the read that missed it. And a stream that
 * cannot be trusted hands the decision back to whatever made it before, so a
 * socket nobody noticed was down is a job that polls, not a job that sleeps.
 */
export const pushed = (opts: PushedOptions): Pushed => {
  const sweepMs = opts.sweepMs ?? 15 * 60_000;
  const now = opts.now ?? Date.now;
  const spotOf = opts.spread ?? ((wallet: string) => spot(wallet, sweepMs));
  const startedAt = now();
  const news = new Set<string>();
  const lastRead = new Map<string, number>();

  return {
    changed(wallet) {
      news.add(wallet);
    },

    due(wallet) {
      if (news.has(wallet)) return true;
      if (!opts.live()) return opts.blind?.due(wallet) ?? true;
      const last = lastRead.get(wallet);
      return last === undefined ? now() - startedAt >= spotOf(wallet) : now() - last >= sweepMs;
    },

    read(wallet) {
      const at = now();
      news.delete(wallet);
      lastRead.set(wallet, at);
      /* The fallback is told too, even while it is not deciding anything: a
         clock that stopped while the stream was up would make every wallet
         due at once the moment the stream went down. */
      opts.blind?.read(wallet);
      // Bounded by who has been read lately, not by everyone who ever was.
      if (lastRead.size > 1_000) {
        for (const [w, t] of lastRead) if (at - t >= sweepMs) lastRead.delete(w);
      }
    },

    spotOf,
    size: () => lastRead.size,
  };
};
