export type EventKind =
  "buy" | "sell" | "basket" | "recurring" | "dividend" | "receive" | "send" | "interest" | "queued";

export type Detail = { label: string; value: string; tone?: "up" | "down" | "muted" };

export type Event = {
  /** ISO date, so month and year can be filtered on. */
  date: string;
  kind: EventKind;
  title: string;
  sub: string;
  amount: string | null;
  /** Which way money moved, for the sign and colour. Null for no cash movement. */
  flow: "in" | "out" | null;
  pending?: boolean;
  details: Detail[];
  signature?: string;
  /** Wrapped SOL for native SOL, the USDC mint for cash, else a stock token. */
  mint?: string;
  /** The stock's mark, when the mint is one we list. */
  logo?: string;
};

export type Day = { date: string; events: Event[] };

/** Coarse groups, because nine individual kinds is more chips than anyone reads. */
export type Group = "all" | "trades" | "transfers" | "income" | "pending";

export const GROUPS: { key: Group; label: string; kinds: EventKind[] }[] = [
  { key: "all", label: "Everything", kinds: [] },
  { key: "trades", label: "Trades", kinds: ["buy", "sell", "basket", "recurring"] },
  { key: "transfers", label: "Transfers", kinds: ["receive", "send"] },
  { key: "income", label: "Income", kinds: ["dividend", "interest"] },
  { key: "pending", label: "Pending", kinds: ["queued"] },
];

export const KIND_LABEL: Record<EventKind, string> = {
  buy: "Buy",
  sell: "Sell",
  basket: "Basket",
  recurring: "Recurring",
  dividend: "Dividend",
  receive: "Receive",
  send: "Send",
  interest: "Interest",
  queued: "Queued",
};
