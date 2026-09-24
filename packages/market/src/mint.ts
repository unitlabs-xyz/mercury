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
 */
export class MintMultipliers implements MultiplierSource {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; value: Promise<MintConfig | null> }>();

  constructor(private readonly config: MintMultipliersConfig) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  private read(mint: string): Promise<MintConfig | null> {
    const hit = this.cache.get(mint);
    if (hit !== undefined && this.now() - hit.at < this.ttlMs) return hit.value;
    // The promise is cached, not the result, so two concurrent asks share a call.
    const value = this.config.chain.mintConfig(mint);
    this.cache.set(mint, { at: this.now(), value });
    return value;
  }

  async multiplierFor(mint: string): Promise<Decimal | null> {
    return (await this.read(mint))?.multiplier ?? null;
  }

  async isPaused(mint: string): Promise<boolean> {
    return (await this.read(mint))?.isPaused === true;
  }
}
