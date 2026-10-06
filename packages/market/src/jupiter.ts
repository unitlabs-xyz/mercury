import { D, ZERO, ONE, type Decimal, type ReferencePrice } from "@mercury/core";
import type { TokenRegistry } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, ReferenceSource, TokenPrice } from "./ports.js";
import { defaultFetch } from "@mercury/chain";

/** Jupiter's free tier. Keyless and CORS-open, which is what makes it the fallback path. */
const BASE = "https://lite-api.jup.ag";

/** The most ids price/v3 takes in one request. */
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

export interface JupiterMarketConfig {
  readonly registry: TokenRegistry;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
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

  constructor(private readonly config: JupiterMarketConfig) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? defaultFetch();
    this.now = config.now ?? Date.now;
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
      for (let i = next++; i < batches.length; i = next++) {
        const res = await this.doFetch(`${this.base}/price/v3?ids=${batches[i]!.join(",")}`);
        if (!res.ok) throw new Error(`jupiter price/v3 returned ${res.status}`);
        pages[i] = (await res.json()) as Record<string, JupPrice | null>;
      }
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
   * The reference is one real share's price, taken from the Backed wrapper where
   * there is one. Both issuers wrap the same company, so either would do; Backed
   * is preferred because its pools are the deep ones and its feed is the one that
   * keeps updating.
   */
  async priceFor(ticker: string): Promise<ReferencePrice | null> {
    const wrappers = await this.config.registry.wrappersFor(ticker);
    if (wrappers.length === 0) return null;

    const board = await this.pricesFor(wrappers.map((w) => w.mint));
    const preferred = wrappers.find((w) => w.issuer === "backed") ?? wrappers[0]!;
    const price = board.get(preferred.mint) ?? [...board.values()][0];
    if (price === undefined || price.pricePerShare === null) return null;

    return {
      pricePerShare: price.pricePerShare,
      observedAt: price.observedAt ?? new Date(this.now()),
      // A dividend that has gone ex but is not yet folded into the multiplier.
      // No upstream we read publishes one, so it is zero and honestly so.
      pendingDividendNet: ZERO,
    };
  }

  async multiplierFor(mint: string): Promise<Decimal | null> {
    return (await this.pricesFor([mint])).get(mint)?.multiplier ?? null;
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
