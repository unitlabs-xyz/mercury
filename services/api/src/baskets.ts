import type { Constituent } from "@harbor/core";

export interface BasketDef {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly feeBps: number;
  readonly minimumUsd: string;
  /** While the venue integration is young. Shown in the app on purpose. See docs/09. */
  readonly capUsd: string | null;
  readonly constituents: readonly Constituent[];
  readonly status: "locked" | "pending_routing_sweep";
}

/**
 * Core US is locked: both constituents measured at 0.00% and 0.11% price impact on
 * 19 September, the two deepest tokenized equities on Solana. It will never fail a leg.
 *
 * The other two are chosen in week one by the routing sweep, not by opinion. A
 * constituent ships only if impact is under 1% at $1,000 and under 2% at $10,000.
 * See docs/09.
 */
export const BASKETS: readonly BasketDef[] = [
  {
    slug: "core-us",
    name: "Core US",
    description: "The whole US market, tilted toward technology. The one most people should buy.",
    feeBps: 0,
    minimumUsd: "25",
    capUsd: "5000",
    status: "locked",
    constituents: [
      { ticker: "SPY", weightBps: 7000 },
      { ticker: "QQQ", weightBps: 3000 },
    ],
  },
];

export const CANDIDATE_BASKETS = {
  "big-tech": ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA"],
  "ai-and-semis": ["NVDA", "AVGO", "AMD", "TSM", "ASML", "MU"],
} as const;
