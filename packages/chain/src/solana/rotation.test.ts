import { describe, expect, it } from "vitest";
import { rotatingFetch, rotation } from "./rotation.js";

const A = "https://a.example";
const B = "https://b.example";
const C = "https://c.example";

/** A node per URL that answers with the status scripted for it, and a log of who was asked. */
const nodes = (status: Record<string, number[]>) => {
  const asked: string[] = [];
  const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    asked.push(url);
    const next = status[url]?.shift() ?? 200;
    return new Response(next === 200 ? '{"jsonrpc":"2.0","id":0,"result":1}' : null, { status: next });
  }) as typeof fetch;
  return { asked, doFetch };
};

describe("rotation", () => {
  it("takes the URLs in turn", () => {
    const r = rotation([A, B, C]);
    expect([r.next(), r.next(), r.next(), r.next()]).toEqual([A, B, C, A]);
  });

  it("rests a URL that refused, twice as long each time it refuses again in a row", () => {
    let now = 0;
    const r = rotation([A, B], { now: () => now, restMs: 1_000 });
    r.refused(A);
    expect([r.next(), r.next()]).toEqual([B, B]);
    now = 1_000;
    expect(r.next()).toBe(A);
    r.refused(A);
    now = 2_500;
    expect([r.next(), r.next()]).toEqual([B, B]);
    now = 3_000;
    expect(r.next()).toBe(A);
  });

  it("forgets a URL's refusals once it answers", () => {
    let now = 0;
    const r = rotation([A, B], { now: () => now, restMs: 1_000 });
    r.refused(A);
    now = 1_000;
    r.served(A);
    r.refused(A);
    now = 2_000;
    expect([r.next(), r.next()]).toContain(A);
  });

  it("has nothing to offer while every URL rests", () => {
    const r = rotation([A, B]);
    r.refused(A);
    r.refused(B);
    expect(r.next()).toBeNull();
  });
});

describe("rotatingFetch", () => {
  /*
   * One free endpoint refuses the background jobs past a modest rate. Taken in
   * turn, one that refuses rests while the others carry the same request.
   */
  it("sends a refused request straight on to the next URL", async () => {
    const n = nodes({ [A]: [429] });
    const r = rotation([A, B]);
    const res = await rotatingFetch(r, n.doFetch)("ignored", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(n.asked).toEqual([A, B]);
    // A rests: the next request goes to B without asking A.
    await rotatingFetch(r, n.doFetch)("ignored", { method: "POST", body: "{}" });
    expect(n.asked).toEqual([A, B, B]);
  });

  it("treats a server error, a forbidden method and a dropped connection as a refusal too", async () => {
    const r = rotation([A, B, C]);
    let calls = 0;
    const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
      calls += 1;
      if (String(input) === A) return new Response(null, { status: 503 });
      if (String(input) === B) throw new TypeError("fetch failed");
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const f = rotatingFetch(r, doFetch);
    expect((await f("x", {})).status).toBe(200);
    expect(calls).toBe(3);
    const forbidden = rotation([A, B]);
    const n = nodes({ [A]: [403] });
    expect((await rotatingFetch(forbidden, n.doFetch)("x", {})).status).toBe(200);
  });

  it("answers the refusal, and records the strain, when every URL refuses", async () => {
    let now = 5;
    const r = rotation([A, B], { now: () => now });
    const n = nodes({ [A]: [429], [B]: [429] });
    const res = await rotatingFetch(r, n.doFetch)("x", {});
    expect(res.status).toBe(429);
    expect(r.strainedAt).toBe(5);
    // Both rest now: a 429 at once, without asking either.
    now = 6;
    expect((await rotatingFetch(r, n.doFetch)("x", {})).status).toBe(429);
    expect(n.asked).toEqual([A, B]);
  });

  /*
   * Measured 22 October 2026: PublicNode answered a batch with HTTP 200 and
   * "Request blocked" for every call, and dRPC with "chain is not available on
   * free plan". Taken at face value, every other background read would fail.
   */
  it("passes a request on from an endpoint that refuses every call inside a 200", async () => {
    const blocked = JSON.stringify([
      { jsonrpc: "2.0", id: 0, error: { code: -32602, message: "Request blocked" } },
      { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Request blocked" } },
    ]);
    const asked: string[] = [];
    const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
      asked.push(String(input));
      return String(input) === A
        ? new Response(blocked, { status: 200 })
        : new Response('[{"jsonrpc":"2.0","id":0,"result":1},{"jsonrpc":"2.0","id":1,"result":2}]', {
            status: 200,
          });
    }) as typeof fetch;
    const r = rotation([A, B]);
    const res = await rotatingFetch(r, doFetch)("x", { method: "POST", body: "[]" });
    expect(await res.json()).toEqual([
      { jsonrpc: "2.0", id: 0, result: 1 },
      { jsonrpc: "2.0", id: 1, result: 2 },
    ]);
    expect(asked).toEqual([A, B]);
  });

  it("passes back an error that is the call's own, such as a bad parameter", async () => {
    const own = '{"jsonrpc":"2.0","id":0,"error":{"code":-32602,"message":"Invalid param: WrongSize"}}';
    const doFetch = (async () => new Response(own, { status: 200 })) as unknown as typeof fetch;
    const res = await rotatingFetch(rotation([A, B]), doFetch)("x", {});
    expect(await res.text()).toBe(own);
  });

  it("passes any other answer back as it is", async () => {
    const n = nodes({ [A]: [400] });
    const res = await rotatingFetch(rotation([A, B]), n.doFetch)("x", {});
    expect(res.status).toBe(400);
    expect(n.asked).toEqual([A]);
  });
});
