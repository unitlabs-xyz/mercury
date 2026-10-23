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
   * Measured 22 October 2026: PublicNode answered with HTTP 200 and "Request
   * blocked", and dRPC with "chain is not available on free plan". Taken at
   * face value, every other background read would fail.
   */
  it("passes a request on from an endpoint that refuses it inside a 200", async () => {
    const blocked = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      error: { code: -32602, message: "Request blocked" },
    });
    const asked: string[] = [];
    const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
      asked.push(String(input));
      return String(input) === A
        ? new Response(blocked, { status: 200 })
        : new Response('{"jsonrpc":"2.0","id":0,"result":1}', { status: 200 });
    }) as typeof fetch;
    const r = rotation([A, B]);
    const res = await rotatingFetch(r, doFetch)("x", { method: "POST", body: "{}" });
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 0, result: 1 });
    expect(asked).toEqual([A, B]);
  });

  /* Measured 23 October 2026, on Solana's own endpoint, for a signature page. */
  it("passes on Solana's history store failing for a moment", async () => {
    const storage = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      error: { code: -32019, message: "Failed to query long-term storage; please try again" },
    });
    const asked: string[] = [];
    const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
      asked.push(String(input));
      return String(input) === A
        ? new Response(storage, { status: 200 })
        : new Response('{"jsonrpc":"2.0","id":0,"result":[]}', { status: 200 });
    }) as typeof fetch;
    const res = await rotatingFetch(rotation([A, B]), doFetch)("x", {
      body: '{"jsonrpc":"2.0","id":0,"method":"getSignaturesForAddress","params":[]}',
    });
    expect(await res.json()).toMatchObject({ result: [] });
    expect(asked).toEqual([A, B]);
  });

  it("passes back an error that is the call's own, such as a bad parameter", async () => {
    const own = '{"jsonrpc":"2.0","id":0,"error":{"code":-32602,"message":"Invalid param: WrongSize"}}';
    const doFetch = (async () => new Response(own, { status: 200 })) as unknown as typeof fetch;
    const res = await rotatingFetch(rotation([A, B]), doFetch)("x", {});
    expect(await res.text()).toBe(own);
  });

  /* Solana Vibe Station answers a batch with 400; Pocket a request too large with 413. */
  it("treats any answer that is not a 2xx as a refusal", async () => {
    const n = nodes({ [A]: [400] });
    const res = await rotatingFetch(rotation([A, B]), n.doFetch)("x", {});
    expect(res.status).toBe(200);
    expect(n.asked).toEqual([A, B]);
  });
});

describe("rotatingFetch, method by method", () => {
  const body = (method: string) => JSON.stringify({ jsonrpc: "2.0", id: 0, method, params: [] });
  /** A node that refuses one method with a 403 and serves everything else. */
  const refusing = (url: string, method: string) => {
    const asked: [string, string][] = [];
    const doFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const m = (JSON.parse(String(init?.body)) as { method: string }).method;
      asked.push([String(input), m]);
      return String(input) === url && m === method
        ? new Response(null, { status: 403 })
        : new Response('{"jsonrpc":"2.0","id":0,"result":1}', { status: 200 });
    }) as typeof fetch;
    return { asked, doFetch };
  };

  /*
   * Measured 22 October 2026: PublicNode refuses getTokenAccountsByOwner and
   * serves signatures, transactions and accounts. Resting it for everything
   * would waste the reads it can carry.
   */
  it("rests an endpoint for the method it refused, and keeps it for the others", async () => {
    const n = refusing(A, "getTokenAccountsByOwner");
    const r = rotation([A, B]);
    const f = rotatingFetch(r, n.doFetch);
    await f("x", { method: "POST", body: body("getTokenAccountsByOwner") });
    await f("x", { method: "POST", body: body("getTokenAccountsByOwner") });
    await f("x", { method: "POST", body: body("getSlot") });
    await f("x", { method: "POST", body: body("getSlot") });
    expect(n.asked).toEqual([
      [A, "getTokenAccountsByOwner"],
      [B, "getTokenAccountsByOwner"],
      [B, "getTokenAccountsByOwner"],
      [A, "getSlot"],
      [B, "getSlot"],
    ]);
  });

  it("treats a method an endpoint does not serve as a refusal", async () => {
    const asked: string[] = [];
    const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
      asked.push(String(input));
      return String(input) === A
        ? new Response('{"jsonrpc":"2.0","id":0,"error":{"code":-32601,"message":"Method not found"}}', {
            status: 200,
          })
        : new Response('{"jsonrpc":"2.0","id":0,"result":1}', { status: 200 });
    }) as typeof fetch;
    const res = await rotatingFetch(rotation([A, B]), doFetch)("x", {
      body: body("getTokenAccountsByOwner"),
    });
    expect(await res.json()).toMatchObject({ result: 1 });
    expect(asked).toEqual([A, B]);
  });
});

describe("rotation, by what each endpoint keeps and how fast it may be asked", () => {
  /*
   * Measured 22 October 2026: Solana Vibe Station keeps only recent history,
   * and answers a signature cursor older than that with "Transaction … not
   * found". Solana's own keeps all of it.
   */
  it("never offers an endpoint for a method it is known not to serve", () => {
    const r = rotation([A, B], { skips: new Map([[B, new Set(["getTransaction"])]]) });
    expect([r.next("getTransaction"), r.next("getTransaction"), r.next("getTransaction")]).toEqual([A, A, A]);
    expect([r.next("getSlot"), r.next("getSlot")]).toEqual(expect.arrayContaining([A, B]));
  });

  it("spaces requests to `perSecond`, so a burst does not meet the endpoint's limit all at once", async () => {
    const slept: number[] = [];
    // Three requests asked for at the same instant: the clock does not move between them.
    const r = rotation([A], {
      now: () => 0,
      perSecond: 4,
      sleep: async (ms) => void slept.push(ms),
    });
    await Promise.all([r.wait(), r.wait(), r.wait()]);
    expect(slept).toEqual([250, 500]);
  });

  it("does not wait at all without `perSecond`", async () => {
    const r = rotation([A], { sleep: async () => expect.unreachable() });
    await r.wait();
  });
});

describe("rotatingFetch, history", () => {
  it("passes a cursor an endpoint has no history for on to the next", async () => {
    const asked: string[] = [];
    const doFetch = (async (input: Parameters<typeof fetch>[0]) => {
      asked.push(String(input));
      return String(input) === A
        ? new Response(
            '{"jsonrpc":"2.0","id":0,"error":{"code":-32020,"message":"Transaction 2YDpeWgV not found"}}',
            {
              status: 200,
            },
          )
        : new Response('{"jsonrpc":"2.0","id":0,"result":[]}', { status: 200 });
    }) as typeof fetch;
    const res = await rotatingFetch(rotation([A, B]), doFetch)("x", {
      body: '{"jsonrpc":"2.0","id":0,"method":"getSignaturesForAddress","params":[]}',
    });
    expect(await res.json()).toMatchObject({ result: [] });
    expect(asked).toEqual([A, B]);
  });

  it("waits its turn before every request it sends", async () => {
    let waits = 0;
    const r = rotation([A, B]);
    const paced = { ...r, wait: async () => void (waits += 1) };
    const n = nodes({ [A]: [429] });
    await rotatingFetch(paced as typeof r, n.doFetch)("x", {});
    expect(waits).toBe(2);
  });
});

describe("rotatingFetch, with a fallback", () => {
  const P = "https://paid.example";

  /*
   * Measured 22 October 2026: Solana's public endpoint refused one transaction
   * read in five even at two a second, and the only other keyless endpoint
   * keeps no history. What every public endpoint refuses goes to the paid one.
   */
  it("sends what every endpoint refuses to the fallback, and does not count it as strain", async () => {
    const n = nodes({ [A]: [429], [B]: [429] });
    const r = rotation([A, B], { fallback: P });
    const res = await rotatingFetch(r, n.doFetch)("x", {});
    expect(res.status).toBe(200);
    expect(n.asked).toEqual([A, B, P]);
    expect(r.strainedAt).toBe(0);
  });

  it("never asks the fallback while an endpoint in turn answers", async () => {
    const n = nodes({});
    await rotatingFetch(rotation([A, B], { fallback: P }), n.doFetch)("x", {});
    expect(n.asked).toEqual([A]);
  });

  it("counts strain only when the fallback refuses too, and says so", async () => {
    const n = nodes({ [A]: [429], [P]: [429] });
    let told = 0;
    const r = rotation([A], { fallback: P, now: () => 9, onStrain: () => void (told += 1) });
    expect((await rotatingFetch(r, n.doFetch)("x", {})).status).toBe(429);
    expect(r.strainedAt).toBe(9);
    expect(told).toBe(1);
  });

  /*
   * The fallback is the paid endpoint the routes use. Measured 23 October
   * 2026: a job's eight workers that every free endpoint refused reached it at
   * once, unpaced, and it refused them and the routes with them.
   */
  it("paces what it sends the fallback, apart from the rotation's own pace", async () => {
    const slept: number[] = [];
    const n = nodes({ [A]: [429, 429, 429] });
    const r = rotation([A], {
      fallback: P,
      now: () => 0,
      fallbackPerSecond: 2,
      sleep: async (ms) => void slept.push(ms),
    });
    const f = rotatingFetch(r, n.doFetch);
    await Promise.all([f("x", {}), f("x", {}), f("x", {})]);
    expect(n.asked.filter((u) => u === P)).toHaveLength(3);
    expect(slept).toEqual([500, 1_000]);
  });
});
