import type { Event, EventKind } from "./activity-data.js";

/**
 * One row of `GET /v1/activity`, as the feed receives it.
 *
 * Declared here rather than in a client, because both clients consume it and
 * the mapping below is the only thing that reads every field.
 */
export interface ActivityItem {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly amountUsd: string | null;
  readonly txSignature: string | null;
  readonly mint: string | null;
  readonly logoUrl: string | null;
}

/**
 * An API activity row, as the screen's event model.
 *
 * The server's feed is deliberately thin — docs/05 calls it denormalised on
 * purpose, read constantly and never joined — so `details` is empty here rather
 * than invented. The rows that carry detail are fills, and those arrive with
 * execution in subsystem 3.
 */
const KIND: Record<string, EventKind> = {
  transfer_in: "receive",
  transfer_out: "send",
  basket_funding: "send",
  dividend: "dividend",
  interest: "interest",
  buy: "buy",
  sell: "sell",
  basket: "basket",
  enroll: "basket",
  rebalance: "basket",
  queued: "queued",
  borrow: "borrow",
  repay: "repay",
  pledge: "pledge",
  unpledge: "unpledge",
  loan_alert: "loan_alert",
};

/** Which way money moved, for the sign and the colour. */
const FLOW: Partial<Record<EventKind, "in" | "out">> = {
  receive: "in",
  dividend: "in",
  interest: "in",
  sell: "in",
  send: "out",
  buy: "out",
  basket: "out",
  // A loan is dollars arriving and a repayment is dollars leaving, the same way
  // round as a deposit and a withdrawal. Pledging moves stock, not money, so it
  // has no direction and no sign.
  borrow: "in",
  repay: "out",
};

export const toEvent = (i: ActivityItem): Event => {
  const kind = KIND[i.kind] ?? "receive";
  return {
    date: i.occurredAt.slice(0, 10),
    kind,
    title: i.title,
    sub: i.subtitle ?? "",
    // The amount is stored unsigned; the direction lives in `flow`, so a row
    // never shows the API's sign and its own ("$-200.00", "--$200.00").
    amount:
      i.amountUsd === null
        ? null
        : Math.abs(Number(i.amountUsd)).toLocaleString("en-US", { style: "currency", currency: "USD" }),
    flow: i.kind === "basket_funding" ? null :
      FLOW[kind] ??
      (i.amountUsd === null || Number(i.amountUsd) === 0 ? null : Number(i.amountUsd) < 0 ? "out" : "in"),
    details: [],
    ...(i.txSignature ? { signature: i.txSignature } : {}),
    ...(i.mint ? { mint: i.mint } : {}),
    ...(i.logoUrl ? { logo: i.logoUrl } : {}),
  };
};
