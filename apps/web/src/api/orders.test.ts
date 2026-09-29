import { describe, expect, it } from "vitest";
import { ApiError } from "./client.js";
import { placeBuy, PriceMoved, type BuyIo, type BuyStep } from "./orders.js";

const EXECUTE = { kind: "execute", best: { mint: "Xsc9", pricePerShare: "222.33" } };

/** A server that answers each call in the flow, with any of them overridable. */
const io = (over: Record<string, unknown> = {}) => {
  const calls: string[] = [];
  const steps: BuyStep[] = [];
  const answers: Record<string, unknown> = {
    "/v1/orders": { orderId: "order-1", decision: EXECUTE },
    "/v1/orders/order-1/execute": { transactions: ["UNSIGNED"] },
    "/v1/transactions/send": { signature: "SIG", status: "confirmed" },
    "/v1/orders/order-1/confirm": { shares: "0.4498", pricePerShare: "222.33", usd: "100" },
    ...over,
  };
  const deps: BuyIo = {
    post: async <T>(path: string) => {
      calls.push(path);
      const answer = answers[path];
      if (answer instanceof Error) throw answer;
      return answer as T;
    },
    sign: async (unsigned) => {
      calls.push(`sign:${unsigned}`);
      return "SIGNED";
    },
    onStep: (s) => steps.push(s),
  };
  return { deps, calls, steps };
};

const intent = { ticker: "NVDA", usd: 100 };

describe("placeBuy", () => {
  it("prices, builds, signs, sends and records, in that order", async () => {
    const { deps, calls, steps } = io();
    const result = await placeBuy(deps, intent);

    expect(calls).toEqual([
      "/v1/orders",
      "/v1/orders/order-1/execute",
      "sign:UNSIGNED",
      "/v1/transactions/send",
      "/v1/orders/order-1/confirm",
    ]);
    expect(steps).toEqual(["pricing", "building", "signing", "sending", "recording", "done"]);
    expect(result).toEqual({
      orderId: "order-1",
      shares: "0.4498",
      pricePerShare: "222.33",
      usd: "100",
    });
  });

  it("stops at the server's refusal rather than asking anyone to sign it", async () => {
    const { deps, calls } = io({
      "/v1/orders": {
        orderId: "order-1",
        decision: { kind: "refuse", reason: "reference_stale", detail: "Price is out of date." },
      },
    });
    await expect(placeBuy(deps, intent)).rejects.toThrow("Price is out of date.");
    expect(calls).toEqual(["/v1/orders"]);
  });

  it("turns a price that moved into a question, carrying the new decision", async () => {
    const { deps, calls } = io({
      "/v1/orders/order-1/execute": new ApiError(409, "price_moved", "The price moved.", {
        decision: EXECUTE,
      }),
    });

    const error = await placeBuy(deps, intent).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PriceMoved);
    expect((error as PriceMoved).decision).toEqual(EXECUTE);
    // Nothing was signed, and nothing was sent.
    expect(calls).toEqual(["/v1/orders", "/v1/orders/order-1/execute"]);
  });

  it("reports the chain's own reason when the transaction fails", async () => {
    const { deps, calls } = io({
      "/v1/transactions/send": { signature: "SIG", status: "failed", error: "insufficient funds" },
    });
    await expect(placeBuy(deps, intent)).rejects.toThrow("insufficient funds");
    expect(calls).not.toContain("/v1/orders/order-1/confirm");
  });

  it("refuses to sign nothing when the server builds no transaction", async () => {
    const { deps, calls } = io({ "/v1/orders/order-1/execute": { transactions: [] } });
    await expect(placeBuy(deps, intent)).rejects.toThrow(/no transaction/);
    expect(calls).not.toContain("sign:UNSIGNED");
  });

  it("lets an ordinary failure through as itself, not as a moved price", async () => {
    const { deps } = io({
      "/v1/orders/order-1/execute": new ApiError(503, "upstream_unavailable", "Jupiter is down."),
    });
    const error = await placeBuy(deps, intent).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PriceMoved);
    expect((error as Error).message).toBe("Jupiter is down.");
  });
});
