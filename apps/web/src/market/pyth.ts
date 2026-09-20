import type { InstrumentStatus } from "@harbor/core";

/**
 * Pyth Hermes, no key. Only the metadata endpoint is reachable from a browser:
 * /v2/updates/price/latest is CORS-blocked, verified on 20 September 2026 across
 * the bracket, encoded-bracket and v1 forms. So Pyth gives us the session, not
 * the price — the reference price comes from Jupiter's stockData. See ADR 0010.
 */
const BASE = "https://hermes.pyth.network";

type Feed = {
  id: string;
  market_hours?: { is_open?: boolean; next_open?: number; next_close?: number };
  attributes?: { display_symbol?: string; asset_type?: string };
};

export type Session = {
  status: InstrumentStatus;
  isOpen: boolean;
  nextOpen: Date | null;
  nextClose: Date | null;
};

/**
 * Every US equity shares one exchange calendar, so one ticker answers for all of
 * them. SPY is the one most certain to exist.
 */
export const fetchSession = async (signal?: AbortSignal): Promise<Session> => {
  const res = await fetch(`${BASE}/v2/price_feeds?query=SPY&asset_type=equity`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Pyth price_feeds returned ${res.status}`);
  const feeds = (await res.json()) as Feed[];
  const spy = feeds.find((f) => f.attributes?.display_symbol === "SPY") ?? feeds[0];
  const hours = spy?.market_hours;
  const isOpen = hours?.is_open === true;
  return {
    status: isOpen ? "open" : "closed",
    isOpen,
    nextOpen: hours?.next_open ? new Date(hours.next_open * 1000) : null,
    nextClose: hours?.next_close ? new Date(hours.next_close * 1000) : null,
  };
};
