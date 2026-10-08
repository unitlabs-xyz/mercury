import type { Decision } from "@mercury/types";

/**
 * Where an order has got to.
 *
 * Reported, not displayed. These were labels on a button once, and the button
 * now shows one spinner for the whole of it. They stay because they are how
 * `placeOrder` says which of its five calls it is on, which is what the tests
 * assert the order of, and what a failure report would want to name.
 */
export type OrderStep = "pricing" | "building" | "signing" | "sending" | "recording" | "done";

export interface OrderIntent {
  readonly ticker: string;
  readonly side: "buy" | "sell";
  /** Dollars on both sides. Ignored by the server when `max` is set. */
  readonly usd: number;
  /** Sell the whole position, in tokens. Never set on a buy. */
  readonly max?: boolean;
  /** Trade this issuer's token rather than the best-priced one. Omitted means best price. */
  readonly issuer?: "backed" | "ondo";
  /** The price impact was shown and accepted, so a route that moves the price is allowed. */
  readonly acceptImpact?: boolean;
}

export interface OrderResult {
  readonly orderId: string;
  readonly shares: string;
  readonly pricePerShare: string;
  readonly usd: string;
  /** What the sale made, against average cost. Null on a buy. */
  readonly realisedPnlUsd: string | null;
}

/**
 * The price moved between the quote shown and the transaction being built, far
 * enough that the server stopped rather than fill it. Carries the decision it
 * would fill at now, so the sheet can put the new number in front of the user
 * and let them decide again.
 */
export class PriceMoved extends Error {
  constructor(
    message: string,
    readonly decision: Decision | null,
  ) {
    super(message);
    this.name = "PriceMoved";
  }
}

/**
 * Structural, not `instanceof`.
 *
 * Each client has its own `ApiError` class — one in a browser bundle, one in a
 * React Native one — and this module is shared by both, so it cannot name
 * either. What it can rely on is the field the server sets.
 */
const priceMovedFrom = (e: unknown): PriceMoved | null => {
  if (typeof e !== "object" || e === null) return null;
  const err = e as { code?: unknown; message?: unknown; details?: unknown };
  if (err.code !== "price_moved") return null;
  const details = err.details;
  const decision =
    typeof details === "object" && details !== null && "decision" in details
      ? ((details as { decision: Decision | null }).decision ?? null)
      : null;
  return new PriceMoved(typeof err.message === "string" ? err.message : "The price moved.", decision);
};

/**
 * Everything `placeOrder` needs from the outside world.
 *
 * Injected rather than imported so the order of the calls — which is the whole
 * of what `placeOrder` decides — can be tested without a browser, a phone, a
 * wallet or a server. Each client supplies these from its own plumbing.
 */
export interface OrderIo {
  post<T>(path: string, body: unknown): Promise<T>;
  /** Takes an unsigned transaction in base64 and gives back a signed one. */
  sign(unsigned: string): Promise<string>;
  onStep(step: OrderStep): void;
  /**
   * The transaction is on chain but not yet recorded. A client that can keep
   * the signature somewhere durable does so here, and clears it on `settled`,
   * so a confirm the node was too slow to answer can be asked again later.
   */
  onSent?(sent: { orderId: string; signature: string }): void;
  settled?(orderId: string): void;
  /** Between confirm attempts. Injected so a test does not wait in real time. */
  wait?(ms: number): Promise<void>;
}

/** Attempts and spacing match the basket funding confirm, which solves the same race. */
const CONFIRM_ATTEMPTS = 6;
const CONFIRM_GAP_MS = 2_000;

const isPending = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "transaction_pending";

/**
 * One order, end to end, whichever way it points.
 *
 * Five calls, in this order, because each depends on the last: the server
 * prices the order and records it, re-decides and builds an unsigned
 * transaction, the wallet signs it, the server broadcasts it and waits for
 * confirmation, and the signature goes back so the fill is read off the chain
 * and written into the books.
 *
 * The decision shown on the page and the one that governs the order are both
 * the server's now, but they are made at different moments — once when the
 * order is created and again before it is built. That is why this can refuse
 * an order the page thought was fine, and why the refusal is worth showing
 * rather than swallowing.
 *
 * Nothing here is side-specific but the side itself. The five calls, their
 * order and their failure modes are the same selling as buying — and the same
 * on a phone as in a browser, which is why this lives here rather than in
 * either client.
 */
export async function placeOrder(io: OrderIo, intent: OrderIntent): Promise<OrderResult> {
  io.onStep("pricing");
  const created = await io.post<{ orderId: string; decision: Decision }>("/v1/orders", {
    ticker: intent.ticker,
    side: intent.side,
    amount: String(intent.usd),
    /* Omitted rather than false, so a buy's body is what it always was. */
    ...(intent.max === true ? { max: true } : {}),
    ...(intent.issuer ? { issuer: intent.issuer } : {}),
    ...(intent.acceptImpact === true ? { acceptImpact: true } : {}),
  });
  if (created.decision.kind === "refuse") throw new Error(created.decision.detail);

  io.onStep("building");
  const built = await io
    .post<{ transactions: string[] }>(`/v1/orders/${created.orderId}/execute`, {})
    .catch((e: unknown) => {
      // A price that ran away is not a failure to report as one — it is a
      // question, and the answer is the user's.
      const moved = priceMovedFrom(e);
      if (moved !== null) throw moved;
      throw e;
    });

  const unsigned = built.transactions[0];
  if (unsigned === undefined) throw new Error("The server built no transaction to sign.");

  io.onStep("signing");
  const signed = await io.sign(unsigned);

  io.onStep("sending");
  const sent = await io.post<{ signature: string; status: string; error?: string | null }>(
    "/v1/transactions/send",
    { transaction: signed },
  );
  if (sent.status === "failed") throw new Error(sent.error ?? "The transaction failed on chain.");

  io.onStep("recording");
  /*
   * The transaction is on chain from here on, whatever the rest of this says.
   * The node we ask may not see it for some time, so the signature is handed
   * to the client to keep before the first attempt rather than after the last.
   */
  io.onSent?.({ orderId: created.orderId, signature: sent.signature });
  const confirm = () =>
    io.post<{
      shares: string;
      pricePerShare: string;
      usd: string;
      realisedPnlUsd?: string | null;
    }>(`/v1/orders/${created.orderId}/confirm`, { signature: sent.signature });

  let filled: Awaited<ReturnType<typeof confirm>> | null = null;
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS && filled === null; attempt++) {
    try {
      filled = await confirm();
    } catch (e: unknown) {
      /* Only the node being behind is worth asking again; anything else is an answer. */
      if (!isPending(e) || attempt === CONFIRM_ATTEMPTS - 1) throw e;
      await (io.wait?.(CONFIRM_GAP_MS) ?? new Promise((r) => setTimeout(r, CONFIRM_GAP_MS)));
    }
  }
  if (filled === null) throw new Error("The order was sent but could not be recorded.");

  io.settled?.(created.orderId);
  io.onStep("done");
  return { orderId: created.orderId, ...filled, realisedPnlUsd: filled.realisedPnlUsd ?? null };
}
