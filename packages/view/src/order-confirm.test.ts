import { describe, expect, it } from "vitest";
import { placeOrder, type OrderIo } from "./order.js";

const DECISION = { kind: "accept", side: "buy", ticker: "NVDA", best: { mint: "mint" } };
const FILL = { shares: "0.02", pricePerShare: "235.39", usd: "5" };

/** A server whose confirm is behind for the first `pendingTimes` attempts. */
const io = (pendingTimes: number, confirmError?: unknown) => {
  const sent: { orderId: string; signature: string }[] = [];
  const settled: string[] = [];
  let confirms = 0;
  const port: OrderIo = {
    post: async (path: string) => {
      if (path === "/v1/orders") return { orderId: "o1", decision: DECISION } as never;
      if (path.endsWith("/execute")) return { transactions: ["unsigned"] } as never;
      if (path === "/v1/transactions/send") return { signature: "sig", status: "confirmed" } as never;
      confirms += 1;
      if (confirms <= pendingTimes) throw confirmError ?? { code: "transaction_pending" };
      return FILL as never;
    },
    sign: async () => "signed",
    onStep: () => undefined,
    onSent: (s) => sent.push(s),
    settled: (id) => settled.push(id),
    wait: async () => undefined,
  };
  return { port, sent, settled, confirms: () => confirms };
};

const intent = { ticker: "NVDA", side: "buy", usd: 5 } as never;

describe("placeOrder confirm", () => {
  it("keeps asking while the node is behind, then records the fill", async () => {
    const t = io(3);
    await expect(placeOrder(t.port, intent)).resolves.toMatchObject({ orderId: "o1", shares: "0.02" });
    expect(t.confirms()).toBe(4);
  });

  it("hands the signature out before the first confirm, and clears it once recorded", async () => {
    const t = io(2);
    await placeOrder(t.port, intent);
    expect(t.sent).toEqual([{ orderId: "o1", signature: "sig" }]);
    expect(t.settled).toEqual(["o1"]);
  });

  it("keeps the signature when every attempt is spent, so it can be asked again later", async () => {
    const t = io(Number.MAX_SAFE_INTEGER);
    await expect(placeOrder(t.port, intent)).rejects.toMatchObject({ code: "transaction_pending" });
    expect(t.sent).toHaveLength(1);
    expect(t.settled).toEqual([]);
  });

  it("does not retry an answer that will not change", async () => {
    const t = io(1, { code: "validation_failed", message: "Not a fill." });
    await expect(placeOrder(t.port, intent)).rejects.toMatchObject({ code: "validation_failed" });
    expect(t.confirms()).toBe(1);
  });
});
