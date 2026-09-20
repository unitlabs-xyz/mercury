export type EventKind =
  | "buy"
  | "sell"
  | "basket"
  | "recurring"
  | "dividend"
  | "receive"
  | "send"
  | "interest"
  | "queued";

export type Detail = { label: string; value: string; tone?: "up" | "down" | "muted" };

export type Event = {
  id: string;
  kind: EventKind;
  title: string;
  sub: string;
  amount: string | null;
  /** Which way money moved, for the sign and colour. Null for no cash movement. */
  flow: "in" | "out" | null;
  pending?: boolean;
  details: Detail[];
  signature?: string;
};

export type Day = { date: string; events: Event[] };

/** Reverse chronological, most recent first. */
export const ACTIVITY: Day[] = [
  {
    date: "Today, 19 September",
    events: [
      {
        id: "e1",
        kind: "dividend",
        title: "Dividend reinvested · Nvidia",
        sub: "2.398 → 2.401 shares. No cash moved.",
        amount: "+0.003 shares",
        flow: null,
        details: [
          { label: "Multiplier before", value: "×1.001275" },
          { label: "Multiplier after", value: "×1.001701" },
          { label: "Shares gained", value: "0.003", tone: "up" },
          { label: "Cash received", value: "None — the token itself is worth more" },
          { label: "Gross dividend", value: "$0.010 per share" },
          { label: "US withholding", value: "30%", tone: "muted" },
        ],
        signature: "4Bx7kQmF2dVn8pLs9jKcRb3TyWuAeH6gZxMq1NdP4Rk9vT2sYnE5",
      },
      {
        id: "e2",
        kind: "queued",
        title: "Order queued · Apple",
        sub: "Waiting for $246.20 or better. Fills on chain without Harbor open.",
        amount: "$100.00",
        flow: "out",
        pending: true,
        details: [
          { label: "Reference price", value: "$245.50" },
          { label: "Best quote now", value: "$251.80" },
          { label: "Premium", value: "+2.57%", tone: "down" },
          { label: "Your trigger", value: "$246.20 or better" },
          { label: "Why it waited", value: "Premium above the 1% tolerance while the market is shut" },
        ],
      },
    ],
  },
  {
    date: "Yesterday, 18 September",
    events: [
      {
        id: "e3",
        kind: "buy",
        title: "Bought Nvidia",
        sub: "2.249 shares at $222.33 · Backed",
        amount: "$500.00",
        flow: "out",
        details: [
          { label: "Issuer chosen", value: "Backed · NVDAx" },
          { label: "Price per share", value: "$222.33" },
          { label: "Price impact", value: "0.02%", tone: "up" },
          { label: "Ondo would have cost", value: "$1,523.66 per share · 85.27% impact", tone: "down" },
          { label: "Premium to reference", value: "+0.08%" },
          { label: "Fee", value: "$1.25" },
        ],
        signature: "2Kp9mR4tLw7xQvN3bYcH8eJfA6sD1gZuM5oP0iT9rE2yV4nB7kXc",
      },
      {
        id: "e4",
        kind: "interest",
        title: "Interest paid",
        sub: "On your stablecoin balance",
        amount: "$12.43",
        flow: "in",
        details: [
          { label: "Rate", value: "4.1% a year" },
          { label: "Average balance", value: "$3,640.12" },
          { label: "Period", value: "1 – 18 September" },
        ],
      },
    ],
  },
  {
    date: "17 September",
    events: [
      {
        id: "e5",
        kind: "recurring",
        title: "Recurring run · $200 monthly",
        sub: "Semiconductors $120 · S&P 500 $80",
        amount: "$200.00",
        flow: "out",
        details: [
          { label: "Semiconductors basket", value: "$120.00 · 60%" },
          { label: "S&P 500", value: "$80.00 · 40%" },
          { label: "Every leg routed", value: "Yes — nothing was skipped" },
          { label: "Next run", value: "1 October" },
        ],
        signature: "7Yn2cV5bQ8wE1rT4uI9oP3aS6dF0gH7jK2lZ5xC8vB1nM4qW6eR9",
      },
    ],
  },
  {
    date: "15 September",
    events: [
      {
        id: "e6",
        kind: "receive",
        title: "Received USDC",
        sub: "From an external wallet",
        amount: "$2,000.00",
        flow: "in",
        details: [
          { label: "Token", value: "USDC on Solana" },
          { label: "From", value: "9mK…4fB2" },
          { label: "Started earning", value: "Immediately, at 4.1%" },
        ],
        signature: "5Rt8yU2iO6pA1sD4fG7hJ0kL3zX9cV6bN5mQ2wE8rT1yU4iO7pA3",
      },
    ],
  },
  {
    date: "12 September",
    events: [
      {
        id: "e7",
        kind: "basket",
        title: "Bought Semiconductors",
        sub: "Six positions in one action",
        amount: "$1,000.00",
        flow: "out",
        details: [
          { label: "Nvidia 30%", value: "$300.00 · Backed" },
          { label: "Broadcom 22%", value: "$220.00 · Backed" },
          { label: "AMD 18%", value: "$180.00 · Backed" },
          { label: "TSMC 14%", value: "$140.00 · Backed" },
          { label: "ASML 10%", value: "$100.00 · Ondo" },
          { label: "Micron 6%", value: "$60.00 · Backed" },
          { label: "Held as", value: "One basket token" },
          { label: "Fee", value: "0.5% a year on the position" },
        ],
        signature: "3Qw6eR9tY2uI5oP8aS1dF4gH7jK0lZ3xC6vB9nM2qW5eR8tY1uI4",
      },
      {
        id: "e8",
        kind: "sell",
        title: "Sold Tesla",
        sub: "0.704 shares at $426.07 · Backed",
        amount: "$300.00",
        flow: "in",
        details: [
          { label: "Issuer used", value: "Backed · TSLAx" },
          { label: "Price per share", value: "$426.07" },
          { label: "Price impact", value: "0.02%", tone: "up" },
          { label: "Cost basis", value: "Estimated — this lot was transferred in", tone: "muted" },
          { label: "Fee", value: "$0.75" },
        ],
        signature: "8Zx1cV4bN7mQ0wE3rT6yU9iO2pA5sD8fG1hJ4kL7zX0cV3bN6mQ9",
      },
    ],
  },
  {
    date: "1 September",
    events: [
      {
        id: "e9",
        kind: "receive",
        title: "Received USDC",
        sub: "Your first deposit",
        amount: "$5,000.00",
        flow: "in",
        details: [
          { label: "Token", value: "USDC on Solana" },
          { label: "From", value: "9mK…4fB2" },
          { label: "Started earning", value: "Immediately, at 4.1%" },
        ],
        signature: "6Vb9nM2qW5eR8tY1uI4oP7aS0dF3gH6jK9lZ2xC5vB8nM1qW4eR7",
      },
    ],
  },
];
