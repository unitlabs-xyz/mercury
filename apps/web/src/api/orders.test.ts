import { describe, expect, it } from "vitest";
import { ApiError } from "./client.js";
import { placeOrder, PriceMoved, type OrderIo, type OrderStep } from "./orders.js";

const EXECUTE = { kind: "execute", best: { mint: "Xsc9", pricePerShare: "222.33" } };

/** A server that answers each call in the flow, with any of them overridable. */
const io = (over: Record<string, unknown> = {}) => {
  const calls: string[] = [];
  const steps: OrderStep[] = [];
  const answers: Record<string, unknown> = {
    "/v1/orders": { orderId: "order-1", decision: EXECUTE },
    "/v1/orders/order-1/execute": { transactions: ["UNSIGNED"] },
    "/v1/transactions/send": { signature: "SIG", status: "confirmed" },
    "/v1/orders/order-1/confirm": {
      shares: "0.4498",
      pricePerShare: "222.33",
      usd: "100",
      realisedPnlUsd: null,
    },
    ...over,
  };
  const deps: OrderIo = {
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

const intent = { ticker: "NVDA", side: "buy" as const, usd: 100 };

describe("placeOrder", () => {
  it("prices, builds, signs, sends and records, in that order", async () => {
    const { deps, calls, steps } = io();
    const result = await placeOrder(deps, intent);

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
      realisedPnlUsd: null,
    });
  });

  it("stops at the server's refusal rather than asking anyone to sign it", async () => {
    const { deps, calls } = io({
      "/v1/orders": {
        orderId: "order-1",
        decision: { kind: "refuse", reason: "reference_stale", detail: "Price is out of date." },
      },
    });
    await expect(placeOrder(deps, intent)).rejects.toThrow("Price is out of date.");
    expect(calls).toEqual(["/v1/orders"]);
  });

  it("turns a price that moved into a question, carrying the new decision", async () => {
    const { deps, calls } = io({
      "/v1/orders/order-1/execute": new ApiError(409, "price_moved", "The price moved.", {
        decision: EXECUTE,
      }),
    });

    const error = await placeOrder(deps, intent).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PriceMoved);
    expect((error as PriceMoved).decision).toEqual(EXECUTE);
    // Nothing was signed, and nothing was sent.
    expect(calls).toEqual(["/v1/orders", "/v1/orders/order-1/execute"]);
  });

  it("reports the chain's own reason when the transaction fails", async () => {
    const { deps, calls } = io({
      "/v1/transactions/send": { signature: "SIG", status: "failed", error: "insufficient funds" },
    });
    await expect(placeOrder(deps, intent)).rejects.toThrow("insufficient funds");
    expect(calls).not.toContain("/v1/orders/order-1/confirm");
  });

  it("refuses to sign nothing when the server builds no transaction", async () => {
    const { deps, calls } = io({ "/v1/orders/order-1/execute": { transactions: [] } });
    await expect(placeOrder(deps, intent)).rejects.toThrow(/no transaction/);
    expect(calls).not.toContain("sign:UNSIGNED");
  });

  it("lets an ordinary failure through as itself, not as a moved price", async () => {
    const { deps } = io({
      "/v1/orders/order-1/execute": new ApiError(503, "upstream_unavailable", "Jupiter is down."),
    });
    const error = await placeOrder(deps, intent).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PriceMoved);
    expect((error as Error).message).toBe("Jupiter is down.");
  });
});

describe("placeOrder, selling", () => {
  /** The same server, with every request body kept. */
  const spy = (over: Record<string, unknown> = {}) => {
    const { deps } = io(over);
    const bodies: unknown[] = [];
    const io2: OrderIo = {
      ...deps,
      post: async <T>(path: string, body: unknown) => {
        bodies.push(body);
        return await deps.post<T>(path, body);
      },
    };
    return { io: io2, bodies };
  };

  it("sends the side it was given", async () => {
    const { io: deps, bodies } = spy();
    await placeOrder(deps, { ticker: "NVDA", side: "sell", usd: 100 });
    expect(bodies[0]).toMatchObject({ side: "sell", amount: "100" });
  });

  it("carries max through, because Sell all is not a dollar figure", async () => {
    const { io: deps, bodies } = spy();
    await placeOrder(deps, { ticker: "NVDA", side: "sell", usd: 30.47, max: true });
    expect(bodies[0]).toMatchObject({ max: true });
  });

  /* Omitted rather than false, so a buy's body is byte-identical to before. */
  it("leaves max off a buy entirely", async () => {
    const { io: deps, bodies } = spy();
    await placeOrder(deps, { ticker: "NVDA", side: "buy", usd: 100 });
    expect(bodies[0]).not.toHaveProperty("max");
  });

  it("returns the realised gain the server reports", async () => {
    const { io: deps } = spy({
      "/v1/orders/order-1/confirm": {
        shares: "0.45",
        pricePerShare: "222.33",
        usd: "100",
        realisedPnlUsd: "2.18",
      },
    });
    const r = await placeOrder(deps, { ticker: "NVDA", side: "sell", usd: 100 });
    expect(r.realisedPnlUsd).toBe("2.18");
  });
});
