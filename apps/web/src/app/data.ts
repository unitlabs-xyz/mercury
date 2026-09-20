/**
 * Dummy portfolio, matching the signed-in screen in docs/design/Harbor.dc.html.
 * Prices are the measured Jupiter quotes from 19 September 2026.
 */

export const TOTAL = {
  value: "$12,480.62",
  changePct: "10.68%",
  changeUsd: "+$1,204.18",
  since: "since you opened",
};

export const SPLIT = [
  { label: "Stocks", value: "$5,795.49", share: 46.4, fill: "bg-ramp-a" },
  { label: "Baskets", value: "$2,150.40", share: 17.2, fill: "bg-ramp-b" },
  { label: "Cash · earning 4.1%", value: "$4,534.73", share: 36.4, fill: "bg-ramp-c" },
];

export const WATCHLIST = [
  { mark: "N", tone: "bg-nvidia", ticker: "NVDA", price: "$222.29", move: "1.56%", dir: "up" },
  { mark: "S&P", tone: "bg-spy", ticker: "SPY", price: "$664.21", move: "0.31%", dir: "up" },
  { mark: "T", tone: "bg-ink-soft", ticker: "TSLA", price: "$426.07", move: "0.94%", dir: "down" },
  { mark: "A", tone: "bg-ink-soft", ticker: "AAPL", price: "$245.50", move: "queued", dir: "queued" },
] as const;

export const EVENTS = [
  {
    kind: "dividend",
    title: "Dividend reinvested",
    body: "You now own 2.401 shares of Nvidia, up from 2.398. No cash moved — the token's multiplier rose.",
  },
  {
    kind: "queued",
    title: "1 order queued",
    body: "Apple · $100 · waits for $246.20 or better. Fills on chain without Harbor open.",
  },
] as const;

export type Holding = {
  mark: string;
  tone: string;
  name: string;
  sub: string;
  badge?: string;
  shares: string;
  price: string;
  value: string;
  today: string | null;
  dir: "up" | "down" | null;
};

export const HOLDINGS: Holding[] = [
  {
    mark: "N",
    tone: "bg-nvidia",
    name: "Nvidia",
    sub: "NVDAx · NVDAon",
    badge: "2 issuers",
    shares: "2.401",
    price: "$222.29",
    value: "$533.28",
    today: "+1.82%",
    dir: "up",
  },
  {
    mark: "S&P",
    tone: "bg-spy",
    name: "S&P 500",
    sub: "SPYx · Backed",
    shares: "5.998",
    price: "$664.21",
    value: "$3,984.00",
    today: "+0.31%",
    dir: "up",
  },
  {
    mark: "◲",
    tone: "bg-brand",
    name: "Semiconductors",
    sub: "Basket · 6 stocks · 0.5% a year",
    shares: "—",
    price: "—",
    value: "$2,150.40",
    today: "+2.14%",
    dir: "up",
  },
  {
    mark: "T",
    tone: "bg-ink-soft",
    name: "Tesla",
    sub: "TSLAx · TSLAon",
    badge: "est. basis",
    shares: "3.000",
    price: "$426.07",
    value: "$1,278.21",
    today: "−0.94%",
    dir: "down",
  },
  {
    mark: "$",
    tone: "bg-faint",
    name: "Cash",
    sub: "Stablecoins · earning 4.1%",
    shares: "—",
    price: "—",
    value: "$4,534.73",
    today: null,
    dir: null,
  },
];

export const ISSUER_MIX = [
  { name: "Backed", share: 71 },
  { name: "Ondo", share: 29 },
];

export const MARKET = "Market closed · reopens Mon 21 Sep, 9:30 AM NY";

/** Value over time, as drawn in the design. */
export const CURVE =
  "M0,182 C40,168 68,196 108,160 C148,124 176,150 216,132 C256,114 284,140 324,104 C364,68 392,100 432,82 C472,64 500,84 540,52 C580,20 608,46 648,30 C672,20 686,26 700,18";

export const AXIS = ["Sep 2025", "Jan 2026", "May 2026", "Sep 2026"];
