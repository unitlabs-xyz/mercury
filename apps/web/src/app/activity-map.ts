import type { ActivityItem } from "../api/hooks";
import type { Event, EventKind } from "./activity-data";

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
  dividend: "dividend",
  interest: "interest",
  buy: "buy",
  sell: "sell",
  basket: "basket",
  recurring: "recurring",
  queued: "queued",
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
  recurring: "out",
};

export const toEvent = (i: ActivityItem): Event => {
  const kind = KIND[i.kind] ?? "receive";
  return {
    date: i.occurredAt.slice(0, 10),
    kind,
    title: i.title,
    sub: i.subtitle ?? "",
    amount:
      i.amountUsd === null
        ? null
        : Number(i.amountUsd).toLocaleString("en-US", { style: "currency", currency: "USD" }),
    flow: FLOW[kind] ?? null,
    details: [],
    ...(i.txSignature ? { signature: i.txSignature } : {}),
  };
};
