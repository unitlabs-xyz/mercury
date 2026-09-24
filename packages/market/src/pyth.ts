import type { SessionSource, SessionState } from "./ports.js";

/**
 * Pyth Hermes, no key. Only the metadata endpoint is reachable from a browser:
 * /v2/updates/price/latest is CORS-blocked, verified on 20 September 2026 across
 * the bracket, encoded-bracket and v1 forms. So Pyth gives us the session, not
 * the price — the reference price comes from Jupiter's stockData. See ADR 0010.
 */
const BASE = "https://hermes.pyth.network";

interface Feed {
  readonly id: string;
  readonly market_hours?: {
    readonly is_open?: boolean;
    readonly next_open?: number;
    readonly next_close?: number;
  };
  readonly attributes?: { readonly display_symbol?: string; readonly asset_type?: string };
}

export interface PythSessionsConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/**
 * The exchange's week, not the reader's. A Saturday afternoon in New York is a
 * Sunday morning in Tokyo, and the copy that says "markets open Monday" has to
 * agree with the calendar the orders queue against.
 */
const isWeekendInNewYork = (at: Date): boolean => {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(at);
  return day === "Sat" || day === "Sun";
};

/**
 * The exchange calendar, not a price. Every US equity shares one, so one ticker
 * answers for all of them, and SPY is the one most certain to exist.
 */
export class PythSessions implements SessionSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => Date;

  constructor(config: PythSessionsConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async current(): Promise<SessionState> {
    const res = await this.doFetch(`${this.base}/v2/price_feeds?query=SPY&asset_type=equity`);
    if (!res.ok) throw new Error(`pyth price_feeds returned ${res.status}`);
    const feeds = (await res.json()) as readonly Feed[];

    const spy = feeds.find((f) => f.attributes?.display_symbol === "SPY") ?? feeds[0];
    if (spy === undefined) throw new Error("pyth returned no equity feed to read the calendar from");

    const hours = spy.market_hours;
    const isOpen = hours?.is_open === true;
    return {
      status: isOpen ? "open" : "closed",
      isOpen,
      nextOpenAt: hours?.next_open === undefined ? null : new Date(hours.next_open * 1000),
      nextCloseAt: hours?.next_close === undefined ? null : new Date(hours.next_close * 1000),
      isWeekend: isWeekendInNewYork(this.now()),
    };
  }
}
