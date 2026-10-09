import type { PriceAsk, PriceBoard, TokenPrice } from "./ports.js";

/** Long enough that one two-second sync pass and the reads around it share a price; short enough that nobody sees a stale one. */
const DEFAULT_TTL_MS = 5_000;

/**
 * How long a miss waits for company before going upstream.
 *
 * `price/v3` costs the same for one id as for fifty — measured at about 200ms
 * either way on 9 October 2026, and 50 is a hard ceiling that silently drops
 * the fifty-first. So the thing worth reducing is the number of requests, not
 * the number of ids, and the cache alone could not do it: it shares a request
 * already in flight, but two callers arriving a few milliseconds apart for
 * different mints each paid for their own call. Ten milliseconds of waiting
 * collapses those into one, at 5% of the latency of the call it saves.
 *
 * Zero holds a batch open only for the current microtask, which still collects
 * callers that ask together and delays a caller asking alone not at all.
 */
const DEFAULT_WINDOW_MS = 10;

export interface CachedPriceBoardConfig {
  readonly ttlMs?: number;
  readonly windowMs?: number;
  readonly now?: () => number;
  /** Injected so a test can close a batch by hand rather than by clock. */
  readonly schedule?: (flush: () => void, ms: number) => void;
}

const afterWindow = (flush: () => void, ms: number): void => {
  if (ms <= 0) {
    queueMicrotask(flush);
    return;
  }
  const timer: unknown = setTimeout(flush, ms);
  // Node keeps a process alive for a pending timer, and a price batch is not a
  // reason to stay up. `unref` is Node's own, so a browser is left alone.
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { readonly unref: () => void }).unref();
  }
};

interface Batch {
  readonly mints: Set<string>;
  readonly answer: Promise<ReadonlyMap<string, TokenPrice>>;
}

/**
 * Every price lookup in the server, through one short-lived memory.
 *
 * Without it each caller went upstream on its own: `position-sync` once per
 * wallet every two seconds, the snapshot job, and every portfolio and
 * instrument read — the same few mints asked for over and over, which is how
 * the server spent Jupiter's per-minute limit on its own background work.
 *
 * Three things are shared. An answer, for `ttlMs`, including "no price": a mint
 * Jupiter cannot price is asked about again only once the entry expires. A
 * request in flight: a caller that wants a mint somebody else is already
 * fetching waits on that fetch rather than starting its own. And a request not
 * yet sent: a miss waits `windowMs` for other misses to join it, so callers who
 * want different mints at the same moment share one request instead of paying
 * for one each. A failure is not remembered, so the next caller tries again.
 */
export class CachedPriceBoard implements PriceBoard {
  private readonly ttlMs: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly schedule: (flush: () => void, ms: number) => void;
  private readonly entries = new Map<string, { readonly at: number; readonly price: TokenPrice | null }>();
  private readonly inFlight = new Map<string, Promise<ReadonlyMap<string, TokenPrice>>>();
  /** The batch still collecting mints. There is at most one. */
  private batch: Batch | null = null;

  constructor(
    private readonly inner: PriceBoard,
    config: CachedPriceBoardConfig = {},
  ) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = config.now ?? Date.now;
    this.schedule = config.schedule ?? afterWindow;
  }

  async pricesFor(mints: readonly string[], ask?: PriceAsk): Promise<ReadonlyMap<string, TokenPrice>> {
    const board = new Map<string, TokenPrice>();
    const waits = new Map<string, Promise<ReadonlyMap<string, TokenPrice>>>();
    const misses: string[] = [];
    const at = this.now();
    // A caller may demand fresher than the window. It cannot ask for staler
    // than the board keeps, because there is nothing older here to give.
    const window = Math.min(this.ttlMs, ask?.maxAgeMs ?? this.ttlMs);

    for (const mint of new Set(mints)) {
      const hit = this.entries.get(mint);
      if (hit !== undefined && at - hit.at < window) {
        if (hit.price !== null) board.set(mint, hit.price);
        continue;
      }
      // A fetch already in flight will write an entry newer than this ask
      // whatever age it demanded, so joining one always answers it.
      const pending = this.inFlight.get(mint);
      if (pending !== undefined) waits.set(mint, pending);
      else misses.push(mint);
    }

    if (misses.length > 0) {
      const answer = this.enqueue(misses);
      for (const mint of misses) waits.set(mint, answer);
    }

    // All at once, so every pending fetch has a handler even when an earlier one fails.
    const answers = await Promise.all(
      [...waits].map(async ([mint, pending]) => [mint, (await pending).get(mint)] as const),
    );
    for (const [mint, price] of answers) if (price !== undefined) board.set(mint, price);
    return board;
  }

  /** These mints into the open batch, opening one if there is none. */
  private enqueue(mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>> {
    const open = this.batch;
    if (open !== null) {
      this.join(open, mints);
      return open.answer;
    }

    const waiting = new Set<string>();
    let send: () => void = () => undefined;
    const answer = new Promise<ReadonlyMap<string, TokenPrice>>((resolve, reject) => {
      // Assigned here because a Promise executor runs synchronously, which is
      // what lets the batch be fully built before the window is even opened.
      send = () => {
        const asked = [...waiting];
        this.inner.pricesFor(asked).then(
          (fresh) => {
            const fetchedAt = this.now();
            for (const mint of asked) {
              this.entries.set(mint, { at: fetchedAt, price: fresh.get(mint) ?? null });
              this.inFlight.delete(mint);
            }
            resolve(fresh);
          },
          (error: unknown) => {
            for (const mint of asked) this.inFlight.delete(mint);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      };
    });

    const batch: Batch = { mints: waiting, answer };
    this.batch = batch;
    // Every mint is in the batch before the window opens, so a scheduler that
    // closes it in the same tick still sends a batch with something in it.
    this.join(batch, mints);
    this.schedule(() => {
      // Only ever closes its own batch, never a later one that replaced it.
      if (this.batch === batch) this.batch = null;
      send();
    }, this.windowMs);
    return answer;
  }

  private join(batch: Batch, mints: readonly string[]): void {
    for (const mint of mints) {
      batch.mints.add(mint);
      this.inFlight.set(mint, batch.answer);
    }
  }
}
