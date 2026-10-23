import type { Decimal } from "@mercury/core";
import type { ChainReader, MintConfig } from "@mercury/chain";
import type { MultiplierSource } from "./ports.js";

export interface MintMultipliersConfig {
  readonly chain: ChainReader;
  /** How long one mint's config is held. Multipliers move on dividend days, not on ticks. */
  readonly ttlMs?: number;
  readonly now?: () => number;
}

const DEFAULT_TTL_MS = 60_000;

/**
 * The multiplier, read from the mint rather than from an API.
 *
 * `pricing.ts` asks for the multiplier and the pause state of the same mint at
 * the same moment, so the account is fetched once and both answers come out of
 * it. The cache is short and per-instance: it exists to collapse that pair, not
 * to keep prices.
 *
 * A caller wanting several mints asks for them together, and the reader
 * answers many accounts in one call where it can. What nothing collapses is a
 * loop that awaits each mint before asking for the next — which is why this
 * port takes a list.
 */
export class MintMultipliers implements MultiplierSource {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; value: Promise<MintConfig | null> }>();

  constructor(private readonly config: MintMultipliersConfig) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  /**
   * A promise of each mint's config, from cache where fresh.
   *
   * The promise is cached, not the result, so two concurrent asks share a call.
   * A failure is evicted rather than kept: a rejected promise left in the cache
   * would hand the same error to every caller for the rest of the window.
   */
  private readAll(mints: readonly string[]): ReadonlyMap<string, Promise<MintConfig | null>> {
    const at = this.now();
    const reads = new Map<string, Promise<MintConfig | null>>();
    const missing: string[] = [];

    for (const mint of new Set(mints)) {
      const hit = this.cache.get(mint);
      if (hit !== undefined && at - hit.at < this.ttlMs) reads.set(mint, hit.value);
      else missing.push(mint);
    }
    if (missing.length === 0) return reads;

    const batch = this.config.chain.mintConfigs?.(missing);
    for (const mint of missing) {
      const read =
        batch === undefined ? this.config.chain.mintConfig(mint) : batch.then((c) => c.get(mint) ?? null);
      // Dropping the entry on failure can at worst discard a refresh another
      // caller started in the meantime, which costs one more read.
      const value = read.catch((error: unknown) => {
        this.cache.delete(mint);
        throw error;
      });
      this.cache.set(mint, { at, value });
      reads.set(mint, value);
    }
    return reads;
  }

  private read(mint: string): Promise<MintConfig | null> {
    return this.readAll([mint]).get(mint) ?? Promise.resolve(null);
  }

  async multiplierFor(mint: string): Promise<Decimal | null> {
    return (await this.read(mint))?.multiplier ?? null;
  }

  async multipliersFor(mints: readonly string[]): Promise<ReadonlyMap<string, Decimal>> {
    const reads = this.readAll(mints);
    const found = new Map<string, Decimal>();
    await Promise.all(
      [...reads].map(async ([mint, read]) => {
        const config = await read;
        // Absent, not one: a mint we could not read is a mint we know nothing
        // about, and calling it 1.0 would restate every holder's share count.
        if (config !== null) found.set(mint, config.multiplier);
      }),
    );
    return found;
  }

  async isPaused(mint: string): Promise<boolean> {
    return (await this.read(mint))?.isPaused === true;
  }
}
