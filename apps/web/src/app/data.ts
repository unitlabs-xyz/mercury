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

export type Holding = {
  /** Underlying ticker, where one exists. Baskets and cash have none. */
  ticker?: string;
  logo?: string;
  mark?: string;
  tone?: string;
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
    logo: "/tokens/NVDAx.png",
    ticker: "NVDA",
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
    logo: "/tokens/SPYx.png",
    ticker: "SPY",
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
    logo: "/tokens/TSLAx.png",
    ticker: "TSLA",
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

export const MARKET = "Market closed · reopens Mon 21 Sep, 9:30 AM NY";


export type Point = { label: string; value: number };
export type Range = "1W" | "1M" | "1Y" | "All";

const END = 12480.62;
const START_ALL = END - 1204.18; // the +$1,204.18 all-time gain

/** Deterministic walk, so the series is stable across renders and reloads. */
const walk = (n: number, from: number, to: number, jitter: number): number[] => {
  let seed = 20260919;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const drift = from + (to - from) * t;
    const wobble = i === 0 || i === n - 1 ? 0 : (rand() - 0.5) * jitter;
    return Math.round((drift + wobble) * 100) / 100;
  });
};

const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SERIES: Record<Range, Point[]> = {
  "1W": walk(7, 12388.4, END, 90).map((value, i) => ({ label: DAYS[i] as string, value })),
  "1M": walk(30, 12102.7, END, 150).map((value, i) => ({
    label: `${i + 1} Sep`,
    value,
  })),
  "1Y": walk(13, START_ALL, END, 420).map((value, i) => ({
    label: `${MONTHS[i]} ${i < 4 ? 2025 : 2026}`,
    value,
  })),
  All: walk(13, START_ALL, END, 420).map((value, i) => ({
    label: `${MONTHS[i]} ${i < 4 ? 2025 : 2026}`,
    value,
  })),
};

export const ADDRESS = "7xQmF4d8Vn2pLs9jKcRb3TyWuAeH6gZxMq1NdP4Rk9";

export const CASH = {
  available: "$4,534.73",
  rate: "4.1%",
  earnedThisYear: "$128.44",
  lastPaid: "1 September 2026",
};
