import { describe, expect, it } from "vitest";
import { batchedRpc } from "./batch.js";

const RPC = "https://rpc.example";

interface Sent {
  readonly id?: number;
  readonly method?: string;
}

/** A node that answers each entry with the id it was asked under. */
const node = (reply: (req: Sent, i: number) => unknown, status = 200) => {
  const bodies: string[] = [];
  const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const raw = String(init?.body);
    bodies.push(raw);
    const sent: unknown = JSON.parse(raw);
    const out = Array.isArray(sent) ? (sent as Sent[]).map(reply) : reply(sent as Sent, 0);
    return Promise.resolve(
      new Response(JSON.stringify(out), { status, headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;
  return {
    doFetch,
    bodies,
    get requests() {
      return bodies.length;
    },
  };
};

const ok = (req: Sent, i: number) => ({ jsonrpc: "2.0", id: req.id ?? i, result: req.method });

const nowait = { sleep: async () => {} };

describe("batchedRpc", () => {
  it("sends calls made together as one request", async () => {
    const n = node(ok);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    const results = await Promise.all([call("getA", []), call("getB", []), call("getC", [])]);

    expect(n.requests).toBe(1);
    expect(results).toEqual(["getA", "getB", "getC"]);
  });

  it("sends a lone call as a plain object, the way a node expects one", async () => {
    const n = node(ok);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    await call("getHealth", []);

    expect(JSON.parse(n.bodies[0]!)).toMatchObject({ jsonrpc: "2.0", method: "getHealth" });
    expect(Array.isArray(JSON.parse(n.bodies[0]!))).toBe(false);
  });

  it("does not hold a caller back waiting for company", async () => {
    const n = node(ok);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });
    // No timer to advance: a batch is open only for the current microtask.
    await expect(call("getHealth", [])).resolves.toBe("getHealth");
  });

  /*
   * The question this whole design turns on. Verified against Alchemy on
   * 29 September 2026: an invalid parameter and an unknown method came back
   * as errors beside three results, all under HTTP 200.
   */
  it("fails only the call that failed, and answers the rest", async () => {
    const n = node((req, i) =>
      req.method === "bad"
        ? { jsonrpc: "2.0", id: req.id ?? i, error: { code: -32602, message: "Invalid param" } }
        : ok(req, i),
    );
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    const settled = await Promise.allSettled([call("good", []), call("bad", []), call("alsoGood", [])]);

    expect(n.requests).toBe(1);
    expect(settled.map((s) => s.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect((settled[1] as PromiseRejectedResult).reason.message).toContain("Invalid param");
    // And the error names the method that failed, not a neighbour's.
    expect((settled[1] as PromiseRejectedResult).reason.message).toContain("bad");
  });

  it("answers each caller its own result when the node replies out of order", async () => {
    // Matching by position here would hand every caller somebody else's data.
    const n = node(ok);
    const shuffling = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      n.doFetch(input, init).then(async (r) => {
        const body = (await r.json()) as unknown[];
        return new Response(JSON.stringify([...body].reverse()), {
          headers: { "content-type": "application/json" },
        });
      })) as typeof fetch;
    const call = batchedRpc({ rpcUrl: RPC, fetch: shuffling, ...nowait });

    expect(await Promise.all([call("first", []), call("second", []), call("third", [])])).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("splits a queue larger than the cap, so one failure cannot take everything", async () => {
    const n = node(ok);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, maxBatch: 2, ...nowait });

    await Promise.all(Array.from({ length: 5 }, (_, i) => call(`m${i}`, [])));

    expect(n.requests).toBe(3); // 2 + 2 + 1
  });

  it("retries the whole request when the node refuses it, then succeeds", async () => {
    let attempt = 0;
    const doFetch = ((_i: Parameters<typeof fetch>[0], init?: RequestInit) => {
      attempt += 1;
      if (attempt === 1) return Promise.resolve(new Response("rate limited", { status: 429 }));
      const sent = JSON.parse(String(init?.body)) as Sent[];
      return Promise.resolve(
        new Response(JSON.stringify(sent.map(ok)), { headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;
    const call = batchedRpc({ rpcUrl: RPC, fetch: doFetch, ...nowait });

    expect(await Promise.all([call("a", []), call("b", [])])).toEqual(["a", "b"]);
    expect(attempt).toBe(2);
  });

  it("retries a dropped connection, which is what too many parallel requests cause", async () => {
    let attempt = 0;
    const doFetch = ((_i: Parameters<typeof fetch>[0], init?: RequestInit) => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error("ECONNRESET"));
      const sent = JSON.parse(String(init?.body)) as Sent[];
      return Promise.resolve(
        new Response(JSON.stringify(sent.map(ok)), { headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;
    const call = batchedRpc({ rpcUrl: RPC, fetch: doFetch, ...nowait });

    expect(await Promise.all([call("a", []), call("b", [])])).toEqual(["a", "b"]);
  });

  it("gives up after its attempts and tells every caller in the batch", async () => {
    const n = node(ok, 429);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, attempts: 3, ...nowait });

    const settled = await Promise.allSettled([call("a", []), call("b", [])]);

    expect(settled.every((s) => s.status === "rejected")).toBe(true);
    expect((settled[0] as PromiseRejectedResult).reason.message).toContain("429");
    expect(n.requests).toBe(3);
  });

  it("does not retry a refusal that repeating cannot fix", async () => {
    const n = node(ok, 400);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, ...nowait });

    await expect(call("a", [])).rejects.toThrow("400");
    expect(n.requests).toBe(1);
  });

  it("holds a batch open for a window when asked to", async () => {
    const n = node(ok);
    const call = batchedRpc({ rpcUrl: RPC, fetch: n.doFetch, windowMs: 20, ...nowait });

    const first = call("a", []);
    await new Promise((r) => setTimeout(r, 5));
    const second = call("b", []); // arrives inside the window, so it travels too

    expect(await Promise.all([first, second])).toEqual(["a", "b"]);
    expect(n.requests).toBe(1);
  });
});
