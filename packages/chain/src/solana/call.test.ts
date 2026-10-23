import { describe, expect, it } from "vitest";
import { rpcCall } from "./call.js";

const RPC = "https://rpc.example";

interface Sent {
  readonly method?: string;
  readonly params?: readonly unknown[];
}

/** A node that answers every call with its method's name, and a log of what it was sent. */
const node = (
  reply: (req: Sent) => unknown = (req) => ({ jsonrpc: "2.0", id: 0, result: req.method }),
  status = 200,
) => {
  const bodies: unknown[] = [];
  const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as Sent;
    bodies.push(sent);
    return Promise.resolve(new Response(JSON.stringify(reply(sent)), { status }));
  }) as typeof fetch;
  return { doFetch, bodies };
};

const nowait = { sleep: async () => {} };

describe("rpcCall", () => {
  it("sends each call as its own plain request, never a batch", async () => {
    const n = node();
    const call = rpcCall({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    expect(await Promise.all([call("getA", []), call("getB", [])])).toEqual(["getA", "getB"]);

    expect(n.bodies).toHaveLength(2);
    expect(n.bodies.some(Array.isArray)).toBe(false);
  });

  /* A portfolio and a money request polled together read the same wallet: once is enough. */
  it("asks once for calls that are the same while the first is in flight", async () => {
    const n = node();
    const call = rpcCall({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    await Promise.all([call("getTokenAccountsByOwner", ["w"]), call("getTokenAccountsByOwner", ["w"])]);
    expect(n.bodies).toHaveLength(1);

    // Different parameters are a different call.
    await Promise.all([call("getTokenAccountsByOwner", ["w"]), call("getTokenAccountsByOwner", ["v"])]);
    expect(n.bodies).toHaveLength(3);
  });

  it("asks again once the first answer is in: sharing is only for what is in flight", async () => {
    const n = node();
    const call = rpcCall({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    await call("getSlot", []);
    await call("getSlot", []);

    expect(n.bodies).toHaveLength(2);
  });

  it("passes an error that is the call's own back to its caller", async () => {
    const n = node(() => ({ jsonrpc: "2.0", id: 0, error: { code: -32602, message: "Invalid param" } }));
    const call = rpcCall({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    await expect(call("getA", [])).rejects.toThrow("solana getA: Invalid param");
    expect(n.bodies).toHaveLength(1);
  });

  it("retries a rate limit and a dropped connection", async () => {
    let attempt = 0;
    const doFetch = (() => {
      attempt += 1;
      if (attempt === 1) return Promise.resolve(new Response("rate limited", { status: 429 }));
      if (attempt === 2) return Promise.reject(new Error("ECONNRESET"));
      return Promise.resolve(new Response('{"jsonrpc":"2.0","id":0,"result":7}'));
    }) as typeof fetch;
    const call = rpcCall({ rpcUrl: RPC, fetch: doFetch, ...nowait });

    expect(await call("getSlot", [])).toBe(7);
    expect(attempt).toBe(3);
  });

  it("waits seconds after a rate limit, jittered, and gives up after its attempts", async () => {
    const waits: number[] = [];
    const n = node(undefined, 429);
    const call = rpcCall({
      rpcUrl: RPC,
      fetch: n.doFetch,
      sleep: async (ms) => void waits.push(ms),
      random: () => 1,
    });

    await expect(call("a", [])).rejects.toThrow("solana a returned 429");

    expect(n.bodies).toHaveLength(4);
    expect(waits).toEqual([1_000, 2_000, 4_000]);
  });

  it("treats a rate limit in the body as one too", async () => {
    const waits: number[] = [];
    const n = node(() => ({ jsonrpc: "2.0", id: 0, error: { code: -32029, message: "slow down" } }));
    const call = rpcCall({
      rpcUrl: RPC,
      fetch: n.doFetch,
      sleep: async (ms) => void waits.push(ms),
      random: () => 0,
    });

    await expect(call("a", [])).rejects.toThrow("slow down");

    expect(waits).toEqual([500, 1_000, 2_000]);
  });

  it("keeps the short wait for a server error, and does not retry what repeating cannot fix", async () => {
    const waits: number[] = [];
    const failing = node(undefined, 503);
    await expect(
      rpcCall({
        rpcUrl: RPC,
        fetch: failing.doFetch,
        sleep: async (ms) => void waits.push(ms),
        random: () => 1,
      })("a", []),
    ).rejects.toThrow("503");
    expect(waits).toEqual([200, 400, 800]);

    const refused = node(undefined, 400);
    await expect(rpcCall({ rpcUrl: RPC, fetch: refused.doFetch, ...nowait })("a", [])).rejects.toThrow("400");
    expect(refused.bodies).toHaveLength(1);
  });
});
