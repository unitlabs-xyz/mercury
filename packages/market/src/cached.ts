import type { PriceAsk, PriceBoard, TokenPrice } from "./ports.js";

/** Long enough that one two-second sync pass and the reads around it share a price; short enough that nobody sees a stale one. */
const DEFAULT_TTL_MS = 5_000;

/**
 * How long an entry is still worth showing while it is replaced.
 *
 * Past `ttlMs` a price is no longer fresh, but it is not yet wrong, and the
 * reader who happens to arrive at that moment should not be the one who pays
 * ~200ms to find out. Up to here they are handed what we have and the refresh
 * happens behind them; past here there is nothing worth showing and they wait.
 *
 * A minute, because the alternative to a minute-old price on a shelf is a
 * blocking request, and the figures an order turns on do not come from here —
 * those name an age (see `PriceAsk`) and always wait.
 */
const DEFAULT_STALE_MS = 60_000;

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
  /** Never below `ttlMs`: an entry cannot stop being fresh after it stops being worth showing. */
  readonly staleMs?: number;
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
 * Four things are shared. An answer, for `ttlMs`, including "no price": a mint
 * Jupiter cannot price is asked about again only once the entry expires. A
 * request in flight: a caller that wants a mint somebody else is already
 * fetching waits on that fetch rather than starting its own. A request not yet
 * sent: a miss waits `windowMs` for other misses to join it, so callers who
 * want different mints at the same moment share one request instead of paying
 * for one each. And an entry past its window but inside `staleMs`, which is
 * handed over as it is while a refresh runs behind the reader — so no reader
 * blocks on a mint anyone has asked about lately, and the request rate follows
 * how many distinct mints are being looked at rather than how often entries
 * expire. A failure is not remembered, so the next caller tries again.
 */
export class CachedPriceBoard implements PriceBoard {
  private readonly ttlMs: number;
  private readonly staleMs: number;
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
    this.staleMs = Math.max(this.ttlMs, config.staleMs ?? DEFAULT_STALE_MS);
    this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = config.now ?? Date.now;
    this.schedule = config.schedule ?? afterWindow;
  }

  async pricesFor(mints: readonly string[], ask?: PriceAsk): Promise<ReadonlyMap<string, TokenPrice>> {
    const board = new Map<string, TokenPrice>();
    const waits = new Map<string, Promise<ReadonlyMap<string, TokenPrice>>>();
    const misses: string[] = [];
    const behind: string[] = [];
    const at = this.now();
    // A caller may demand fresher than the window. It cannot ask for staler
    // than the board keeps, because there is nothing older here to give.
    const fresh = Math.min(this.ttlMs, ask?.maxAgeMs ?? this.ttlMs);
    // Naming an age means waiting for one. A price an order is checked against
    // is never served from something we already know to be out of date.
    const mayServeStale = ask?.maxAgeMs === undefined;

    for (const mint of new Set(mints)) {
      const hit = this.entries.get(mint);
      const age = hit === undefined ? Number.POSITIVE_INFINITY : at - hit.at;
      if (hit !== undefined && age < fresh) {
        if (hit.price !== null) board.set(mint, hit.price);
        continue;
      }

      // A fetch already in flight will write an entry newer than this ask
      // whatever age it demanded, so joining one always answers it.
      const pending = this.inFlight.get(mint);

      if (hit !== undefined && age < this.staleMs && mayServeStale) {
        if (hit.price !== null) board.set(mint, hit.price);
        // Somebody is already replacing it; a second ask would buy nothing.
        if (pending === undefined) behind.push(mint);
        continue;
      }

      if (pending !== undefined) waits.set(mint, pending);
      else misses.push(mint);
    }

    if (misses.length > 0 || behind.length > 0) {
      // One batch for both, so a reader who blocks on one mint and is served a
      // stale one for another pays a single request rather than two.
      const answer = this.enqueue([...misses, ...behind]);
      for (const mint of misses) waits.set(mint, answer);
      // A refresh has no caller waiting on it — the reader already has an
      // answer — so its failure must not surface as an unhandled rejection.
      // The entry stays as it was and the next reader asks again.
      if (behind.length > 0) void answer.catch(() => undefined);
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
