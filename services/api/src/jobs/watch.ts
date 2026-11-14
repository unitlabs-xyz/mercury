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
  close(): void;
}

export interface WatchOptions {
  readonly addresses: () => Promise<readonly WatchedAddress[]>;
  readonly subscribe: (address: string, told: () => void) => Subscription;
  /** Told the wallet, never the address: an address in a log is a person's holdings in a log. */
  readonly told: (wallet: string) => void;
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

  return {
    async refresh() {
      const wanted = await opts.addresses();
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

    close() {
      for (const subscription of watching.values()) subscription.close();
      watching.clear();
    },
  };
};
