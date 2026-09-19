import { D, type Decimal, type ReferencePrice } from "@harbor/core";
import { FIXTURE_TOKENS } from "@harbor/chain";
import type { MultiplierSource, ReferenceSource, SessionSource, SessionState } from "./ports.js";

/** The Saturday we measured. Market shut, next open Monday. */
export const FIXTURE_NOW = new Date("2026-09-19T18:00:00Z");

export class FixtureSessionSource implements SessionSource {
  constructor(private readonly override?: Partial<SessionState>) {}
  async current(): Promise<SessionState> {
    return {
      status: "closed",
      isOpen: false,
      nextOpenAt: new Date("2026-09-21T13:30:00Z"),
      nextCloseAt: new Date("2026-09-21T20:00:00Z"),
      isWeekend: true,
      ...this.override,
    };
  }
}

export class FixtureReferenceSource implements ReferenceSource {
  constructor(private readonly pendingDividends: Readonly<Record<string, string>> = {}) {}
  async priceFor(ticker: string): Promise<ReferencePrice | null> {
    const t = FIXTURE_TOKENS.find((x) => x.ticker === ticker);
    if (t === undefined) return null;
    return {
      pricePerShare: D(t.referencePricePerShare),
      observedAt: new Date(Date.now() - 5_000),
      pendingDividendNet: D(this.pendingDividends[ticker] ?? 0),
    };
  }
}

export class FixtureMultiplierSource implements MultiplierSource {
  async multiplierFor(mint: string): Promise<Decimal | null> {
    const t = FIXTURE_TOKENS.find((x) => x.mint === mint);
    return t ? D(t.multiplier) : null;
  }
  async isPaused(): Promise<boolean> {
    return false;
  }
}
