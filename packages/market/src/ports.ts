import type { Decimal, InstrumentStatus, ReferencePrice } from "@mercury/core";

export interface SessionState {
  readonly status: InstrumentStatus;
  readonly isOpen: boolean;
  readonly nextOpenAt: Date | null;
  readonly nextCloseAt: Date | null;
  readonly isWeekend: boolean;
}

/** Pyth publishes a market_session_schedule with holidays and early closes. See ADR 0006. */
export interface SessionSource {
  current(): Promise<SessionState>;
}

/**
 * Chainlink, per ADR 0006. Measured at 0.8bp from fair during a dividend window where a
 * naive underlying x multiplier read 17.3bp low and the raw DEX price read 20bp low.
 */
export interface ReferenceSource {
  priceFor(ticker: string): Promise<ReferencePrice | null>;
}

/** Read from the Token-2022 ScaledUiAmount extension on the mint, not from an API. */
export interface MultiplierSource {
  multiplierFor(mint: string): Promise<Decimal | null>;
  /** Token-2022 Pausable. True when the issuer has halted the token. */
  isPaused(mint: string): Promise<boolean>;
}
