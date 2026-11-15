import type { Subscription } from "@mercury/chain";

/** One address worth watching, and the wallet whose news it is. */
export interface WatchedAddress {
  readonly wallet: string;
  readonly address: string;
}

export interface WatchSummary {
  readonly added: number;
  readonly dropped: number;
  readonly watching: number;
}

export interface Watch {
  /**
   * Bring the subscriptions in line with the addresses now worth watching.
   *
   * Throws what reading the addresses threw, so a job that cannot see its own
   * wallets says so and keeps the subscriptions it already has: a database
   * blip must not quietly stop the stream.
   */
  refresh(): Promise<WatchSummary>;
  /**
   * The subscriptions can be believed to cover what they should.
   *
   * Live sockets are not enough on their own. Everything already subscribed to
   * can be perfectly healthy while the list of what to subscribe to has gone
   * stale — a wallet opened since the last look, a token account nobody has
   * found yet — and a caller that trusted the stream then would wait for news
   * about an address nothing is watching.
   *
   * False before the first look, and after two intervals without one that
   * worked: one missed look is a blip, two is a pattern.
   */
  current(): boolean;
  close(): void;
}

export interface WatchOptions {
  readonly addresses: () => Promise<readonly WatchedAddress[]>;
  readonly subscribe: (address: string, told: () => void) => Subscription;
  /** Told the wallet, never the address: an address in a log is a person's holdings in a log. */
  readonly told: (wallet: string) => void;
  /**
   * The least time between two looks at the addresses. Every call when left
   * out, which suits a list that is one query of SQL.
   *
   * It is not when a list is cheap to read. Finding a wallet's token accounts
   * costs an RPC call per wallet, and doing that on every pass of a job that
   * runs every ten seconds would be the poll this replaces under another name.
   */
  readonly everyMs?: number;
  readonly now?: () => number;
}

/**
 * Keep a set of subscriptions level with a set of addresses.
 *
 * Which addresses those are is the caller's business — the rows of
 * `wallet_stream` for what happened, a wallet's token accounts for what it
 * holds — and so is what kind of subscription to open for them. What is the
 * same either way is the bookkeeping: subscribe to what is new, let go of what
 * is gone, ask for nothing twice, and tell whoever is listening about the
 * wallet rather than the address it arrived on.
 *
 * Letting go matters as much as subscribing. Every connection has a measured
 * ceiling, and an address nobody holds any more would otherwise sit there
 * holding a place that a new wallet needs.
 */
export const watchAddresses = (opts: WatchOptions): Watch => {
  const watching = new Map<string, Subscription>();
  const now = opts.now ?? Date.now;
  let lookedAt: number | null = null;

  return {
    async refresh() {
      const at = now();
      if (opts.everyMs !== undefined && lookedAt !== null && at - lookedAt < opts.everyMs) {
        return { added: 0, dropped: 0, watching: watching.size };
      }
      const wanted = await opts.addresses();
      /* Marked after the read, not before it: a read that threw looked at
         nothing, and holding off for the whole interval would leave a new
         wallet unwatched over one database blip. */
      lookedAt = at;
      let added = 0;
      for (const { wallet, address } of wanted) {
        if (watching.has(address)) continue;
        watching.set(
          address,
          opts.subscribe(address, () => opts.told(wallet)),
        );
        added += 1;
      }

      const keep = new Set(wanted.map((w) => w.address));
      let dropped = 0;
      for (const [address, subscription] of watching) {
        if (keep.has(address)) continue;
        subscription.close();
        watching.delete(address);
        dropped += 1;
      }

      return { added, dropped, watching: watching.size };
    },

    current() {
      if (lookedAt === null) return false;
      return now() - lookedAt < 2 * (opts.everyMs ?? Infinity);
    },

    close() {
      for (const subscription of watching.values()) subscription.close();
      watching.clear();
      lookedAt = null;
    },
  };
};
