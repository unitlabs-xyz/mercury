export type EventKind =
  | "buy"
  | "sell"
  | "basket"
  | "dividend"
  | "receive"
  | "send"
  | "interest"
  | "queued"
  | "borrow"
  | "repay"
  | "pledge"
  | "unpledge";

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

/** Coarse groups, because twelve individual kinds is more chips than anyone reads. */
export type Group = "all" | "trades" | "transfers" | "income" | "borrowing" | "pending";

export const GROUPS: { key: Group; label: string; kinds: EventKind[] }[] = [
  { key: "all", label: "Everything", kinds: [] },
  { key: "trades", label: "Trades", kinds: ["buy", "sell", "basket"] },
  { key: "transfers", label: "Transfers", kinds: ["receive", "send"] },
  { key: "income", label: "Income", kinds: ["dividend", "interest"] },
  // Pledging and withdrawing sit here too: they are not transfers out of the
  // account, they are collateral moving between the wallet and Kamino.
  { key: "borrowing", label: "Borrowing", kinds: ["borrow", "repay", "pledge", "unpledge"] },
  { key: "pending", label: "Pending", kinds: ["queued"] },
];

export const KIND_LABEL: Record<EventKind, string> = {
  buy: "Buy",
  sell: "Sell",
  basket: "Basket",
  dividend: "Dividend",
  receive: "Receive",
  send: "Send",
  interest: "Interest",
  queued: "Queued",
  borrow: "Borrowed",
  repay: "Repaid",
  pledge: "Pledged",
  unpledge: "Withdrew",
};
