import type { PriceBoard, TokenPrice } from "./ports.js";

/** Long enough that one two-second sync pass and the reads around it share a price; short enough that nobody sees a stale one. */
const DEFAULT_TTL_MS = 5_000;

export interface CachedPriceBoardConfig {
  readonly ttlMs?: number;
  readonly now?: () => number;
}

/**
 * Every price lookup in the server, through one short-lived memory.
 *
 * Without it each caller went upstream on its own: `position-sync` once per
 * wallet every two seconds, the snapshot job, and every portfolio and
 * instrument read — the same few mints asked for over and over, which is how
 * the server spent Jupiter's per-minute limit on its own background work.
 *
 * Two things are shared. An answer, for `ttlMs`, including "no price": a mint
 * Jupiter cannot price is asked about again only once the entry expires. And a
 * request in flight: a caller that wants a mint somebody else is already
 * fetching waits on that fetch rather than starting its own. A failure is not
 * remembered, so the next caller tries again.
 */
export class CachedPriceBoard implements PriceBoard {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, { readonly at: number; readonly price: TokenPrice | null }>();
  private readonly inFlight = new Map<string, Promise<ReadonlyMap<string, TokenPrice>>>();

  constructor(
    private readonly inner: PriceBoard,
    config: CachedPriceBoardConfig = {},
  ) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  async pricesFor(mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>> {
    const board = new Map<string, TokenPrice>();
    const waits = new Map<string, Promise<ReadonlyMap<string, TokenPrice>>>();
    const missing: string[] = [];
    const at = this.now();

    for (const mint of new Set(mints)) {
      const hit = this.entries.get(mint);
      if (hit !== undefined && at - hit.at < this.ttlMs) {
        if (hit.price !== null) board.set(mint, hit.price);
        continue;
      }
      const pending = this.inFlight.get(mint);
      if (pending !== undefined) waits.set(mint, pending);
      else missing.push(mint);
    }

    if (missing.length > 0) {
      const fetching = this.inner.pricesFor(missing).then(
        (fresh) => {
          const fetchedAt = this.now();
          for (const mint of missing) {
            this.entries.set(mint, { at: fetchedAt, price: fresh.get(mint) ?? null });
            this.inFlight.delete(mint);
          }
          return fresh;
        },
        (error: unknown) => {
          for (const mint of missing) this.inFlight.delete(mint);
          throw error;
        },
      );
      for (const mint of missing) {
        this.inFlight.set(mint, fetching);
        waits.set(mint, fetching);
      }
    }

    // All at once, so every pending fetch has a handler even when an earlier one fails.
    const answers = await Promise.all(
      [...waits].map(async ([mint, pending]) => [mint, (await pending).get(mint)] as const),
    );
    for (const [mint, price] of answers) if (price !== undefined) board.set(mint, price);
    return board;
  }
}
