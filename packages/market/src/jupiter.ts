import { D, ZERO, ONE, type Decimal, type ReferencePrice } from "@mercury/core";
import type { TokenRegistry } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, ReferenceSource, TokenPrice } from "./ports.js";
import { referenceFrom } from "./reference.js";
import { defaultFetch } from "@mercury/chain";

/** Jupiter's free tier. Keyless and CORS-open, which is what makes it the fallback path. */
const BASE = "https://lite-api.jup.ag";

/**
 * The most ids price/v3 takes in one request.
 *
 * A hard ceiling, and a quiet one: asked for fifty-one, Jupiter answers 200
 * with the first fifty and says nothing about the one it dropped (measured 9
 * October 2026; two hundred ids is refused outright with a 414). So raising
 * this does not fetch more, it silently stops pricing holdings — which is why
 * a test pins it rather than trusting the number to stay read.
 */
const PRICE_BATCH = 50;

/**
 * Batches in flight at once. Pricing the whole universe is ~35 batches, and
 * firing them together spent Jupiter's per-minute limit in a single burst at
 * boot, starving every other caller.
 */
const PRICE_CONCURRENCY = 4;

interface JupPrice {
  readonly usdPrice?: number;
  readonly decimals?: number;
  readonly liquidity?: number;
  readonly priceChange24h?: number;
  /** The underlying share, not the token. Independent of the pool. */
  readonly stockData?: { readonly price?: number; readonly mcap?: number; readonly updatedAt?: string };
  /** Token-2022 ScaledUiAmount. Absent for tokens that have never paid a dividend. */
  readonly scaledUiConfig?: {
    readonly multiplier?: number;
    readonly newMultiplier?: number;
    readonly newMultiplierEffectiveAt?: string;
  };
}

/** A refusal to answer now, rather than an answer. Everything else is final. */
const RETRYABLE = (status: number) => status === 429 || status >= 500;

/**
 * How long to wait before retry `n` (1-based).
 *
 * A rate limit gets seconds and everything else milliseconds, which is the
 * same split `batchedRpc` makes and for the same reason on each side. Jupiter
 * counts requests over a 60-second sliding window and sends no `Retry-After`,
 * so a retry 200ms after a 429 lands inside the same window and is refused
 * again. A 502 or a dropped connection is a different failure, and the short
 * wait suits it — these calls are on the request path, where four attempts a
 * second apart would hang a shelf for seconds before admitting the error.
 *
 * The jitter is so that batches refused together — which, fired four at a
 * time, they are — do not all come back at the same instant.
 */
const backoffMs = (n: number, rateLimited: boolean, random: () => number): number =>
  (rateLimited ? 1_000 : 200) * 2 ** (n - 1) * (0.5 + random() / 2);

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface JupiterMarketConfig {
  readonly registry: TokenRegistry;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** Attempts for a batch that was refused. Four: one try and three retries. */
  readonly attempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** For the jitter; tests pin it. */
  readonly random?: () => number;
}

/** Jupiter's numbers arrive as JSON floats. They become Decimal here and stay that way. */
const dec = (v: number | undefined): Decimal | null =>
  typeof v === "number" && Number.isFinite(v) ? D(v) : null;

/**
 * One call to `/price/v3` answers what a token costs, what its underlying share
 * costs, and what the multiplier is — so one class implements the three ports
 * that need those answers rather than three classes making the same request.
 */
export class JupiterMarket implements ReferenceSource, PriceBoard, MultiplierSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly attempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly config: JupiterMarketConfig) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? defaultFetch();
    this.now = config.now ?? Date.now;
    this.attempts = config.attempts ?? 4;
    this.sleep = config.sleep ?? pause;
    this.random = config.random ?? Math.random;
  }

  /**
   * One batch of ids, retried while Jupiter is only refusing to answer yet.
   *
   * A batch that fails in the end takes the whole call with it, rather than
   * the call returning what the other batches found. That is deliberate: a
   * caller cannot tell a mint Jupiter has no price for from one we never
   * managed to ask about, and `CachedPriceBoard` would write the second down
   * as "no price" and hold it — turning one refused request into a holding
   * missing from a portfolio. Throwing is remembered by nobody and retried by
   * everybody, which is the right way round.
   */
  private async page(ids: readonly string[]): Promise<Record<string, JupPrice | null>> {
    let last: Error | null = null;
    let rateLimited = false;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (attempt > 0) await this.sleep(backoffMs(attempt, rateLimited, this.random));
      rateLimited = false;
      let res: Response;
      try {
        res = await this.doFetch(`${this.base}/price/v3?ids=${ids.join(",")}`);
      } catch (error: unknown) {
        // A dropped connection is what firing four batches at once produces,
        // and it is as retryable as a 429.
        last = error instanceof Error ? error : new Error("jupiter price/v3 failed");
        continue;
      }
      if (res.ok) return (await res.json()) as Record<string, JupPrice | null>;
      last = new Error(`jupiter price/v3 returned ${res.status}`);
      rateLimited = res.status === 429;
      if (!RETRYABLE(res.status)) break;
    }
    throw last ?? new Error("jupiter price/v3 failed");
  }

  async pricesFor(mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>> {
    const board = new Map<string, TokenPrice>();
    if (mints.length === 0) return board;

    // price/v3 answers at most 50 ids per call, so the whole list goes in batches.
    const batches: string[][] = [];
    for (let i = 0; i < mints.length; i += PRICE_BATCH) batches.push(mints.slice(i, i + PRICE_BATCH));
    const pages: Record<string, JupPrice | null>[] = [];
    let next = 0;
    const worker = async (): Promise<void> => {
      for (let i = next++; i < batches.length; i = next++) pages[i] = await this.page(batches[i]!);
    };
    await Promise.all(Array.from({ length: Math.min(PRICE_CONCURRENCY, batches.length) }, worker));
    const body: Record<string, JupPrice | null> = Object.assign({}, ...pages);

    for (const mint of mints) {
      const p = body[mint];
      // Null is Jupiter saying it has no price. Pricing it at zero would wipe a
      // holding off a portfolio; leaving it out lets the caller say "unpriced".
      if (p === null || p === undefined) continue;
      const usdPricePerToken = dec(p.usdPrice);
      if (usdPricePerToken === null) continue;

      board.set(mint, {
        mint,
        usdPricePerToken,
        pricePerShare: dec(p.stockData?.price),
        underlyingMarketCapUsd: dec(p.stockData?.mcap),
        changePct24h: dec(p.priceChange24h),
        liquidityUsd: dec(p.liquidity) ?? ZERO,
        multiplier: this.effectiveMultiplier(p),
        observedAt: p.stockData?.updatedAt === undefined ? null : new Date(p.stockData.updatedAt),
      });
    }
    return board;
  }

  /**
   * The reference, priced from this client's own requests.
   *
   * The server does not read it here — it reads through `BoardReference` onto
   * the shared cache — but the browser has no cache to share, and this is the
   * one place the two agree on which wrapper speaks for a company.
   */
  priceFor(ticker: string): Promise<ReferencePrice | null> {
    return referenceFrom({ registry: this.config.registry, board: this, now: this.now }, ticker);
  }

  /**
   * One request for every mint asked about, rather than one each.
   *
   * `price/v3` carries the multiplier beside the price, so this costs nothing
   * the caller was not already paying — and asking per mint cost a whole
   * request for a single id.
   */
  async multipliersFor(mints: readonly string[]): Promise<ReadonlyMap<string, Decimal>> {
    const board = await this.pricesFor(mints);
    return new Map([...board].map(([mint, price]) => [mint, price.multiplier]));
  }

  async multiplierFor(mint: string): Promise<Decimal | null> {
    return (await this.multipliersFor([mint])).get(mint) ?? null;
  }

  /**
   * A price says nothing about Token-2022 Pausable. The server uses
   * `MintMultipliers`, which reads the flag from the mint; this exists so the
   * fallback path satisfies the port, and it never claims a token is halted on
   * evidence it does not have.
   */
  isPaused(_mint: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  /**
   * Same switchover rule as the mint: `newMultiplier` takes over at its effective
   * time. Jupiter publishes both, and its own `usdPrice` divides the prescaled
   * price by whichever one is in force — which is how the rule was confirmed.
   */
  private effectiveMultiplier(p: JupPrice): Decimal {
    const config = p.scaledUiConfig;
    if (config === undefined) return ONE;
    const current = dec(config.multiplier) ?? ONE;
    const next = dec(config.newMultiplier);
    const at = config.newMultiplierEffectiveAt;
    if (next === null || at === undefined) return current;
    const effectiveAt = Date.parse(at);
    if (Number.isNaN(effectiveAt)) return current;
    return this.now() >= effectiveAt ? next : current;
  }
}
