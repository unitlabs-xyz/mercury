import { describe, expect, it } from "vitest";
import { JUPITER_RPS, paced } from "./pace.js";
import { jupiterAccess } from "./keys.js";

/**
 * A clock the test moves by hand, where sleeping advances it.
 *
 * Real timers would make these tests slow and the assertions approximate; the
 * question here is only ever "when was this allowed to start".
 */
const clock = () => {
  let at = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => at,
    sleep: async (ms: number) => {
      slept.push(ms);
      at += ms;
    },
    advance: (ms: number) => (at += ms),
  };
};

/** Records when each request was admitted, and answers at once. */
const counting = (c: ReturnType<typeof clock>) => {
  const starts: number[] = [];
  const doFetch = (() => {
    starts.push(c.now());
    return Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  return { doFetch, starts };
};

describe("paced", () => {
  it("lets the allowance through without making anything wait", async () => {
    const c = clock();
    const net = counting(c);
    const go = paced(net.doFetch, { perSecond: 3, now: c.now, sleep: c.sleep });
    await Promise.all([go("https://a"), go("https://b"), go("https://c")]);
    expect(net.starts).toEqual([0, 0, 0]);
    expect(c.slept).toEqual([]);
  });

  it("holds the next one back until the window has room", async () => {
    const c = clock();
    const net = counting(c);
    const go = paced(net.doFetch, { perSecond: 3, now: c.now, sleep: c.sleep });
    await Promise.all([go("https://a"), go("https://b"), go("https://c"), go("https://d")]);
    // Exactly to the second, which is when the first start leaves the window.
    // Sleeping any longer would waste the allowance.
    expect(c.slept).toEqual([1_000]);
    expect(net.starts).toEqual([0, 0, 0, 1_000]);
  });

  it("counts a sliding second, not a fixed one", async () => {
    const c = clock();
    const net = counting(c);
    const go = paced(net.doFetch, { perSecond: 2, now: c.now, sleep: c.sleep });
    await Promise.all([go("https://a"), go("https://b")]);
    // 900ms later the first two are still inside the window, so this waits the
    // remaining 100ms rather than being let through by a window that reset.
    c.advance(900);
    await go("https://c");
    expect(c.slept).toEqual([100]);
    expect(net.starts).toEqual([0, 0, 1_000]);
  });

  it("forgets a start once it has left the window", async () => {
    const c = clock();
    const net = counting(c);
    const go = paced(net.doFetch, { perSecond: 2, now: c.now, sleep: c.sleep });
    await Promise.all([go("https://a"), go("https://b")]);
    c.advance(1_000);
    await Promise.all([go("https://c"), go("https://d")]);
    expect(c.slept).toEqual([]);
    expect(net.starts).toEqual([0, 0, 1_000, 1_000]);
  });

  it("admits one at a time, so two callers cannot both take the last slot", async () => {
    const c = clock();
    const net = counting(c);
    const go = paced(net.doFetch, { perSecond: 1, now: c.now, sleep: c.sleep });
    await Promise.all([go("https://a"), go("https://b"), go("https://c")]);
    // Reading the clock independently, all three would have seen room at zero.
    expect(net.starts).toEqual([0, 1_000, 2_000]);
  });

  it("keeps going after a request fails, rather than wedging the queue", async () => {
    const c = clock();
    let calls = 0;
    const go = paced(
      (() => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("fetch failed")) : Promise.resolve(new Response("{}"));
      }) as typeof fetch,
      { perSecond: 5, now: c.now, sleep: c.sleep },
    );
    await expect(go("https://a")).rejects.toThrow("fetch failed");
    expect((await go("https://b")).ok).toBe(true);
  });

  it("passes the request through untouched", async () => {
    const seen: { url: string; headers: string | null }[] = [];
    const go = paced(((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers).get("x-api-key") });
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch);
    await go("https://a/price/v3?ids=X", { headers: { "x-api-key": "k1" } });
    expect(seen).toEqual([{ url: "https://a/price/v3?ids=X", headers: "k1" }]);
  });
});

describe("jupiterAccess, paced", () => {
  it("paces every adapter through one budget, because the allowance is per organisation", async () => {
    const c = clock();
    const net = counting(c);
    // Two keys. Rotating them spreads nothing — the limit is not per key — so
    // the pacing has to be here, where the one shared fetch is.
    const access = jupiterAccess(["k1", "k2"], net.doFetch, {
      perSecond: 2,
      now: c.now,
      sleep: c.sleep,
    });
    await Promise.all([access!.fetch("https://a"), access!.fetch("https://b"), access!.fetch("https://c")]);
    expect(net.starts).toEqual([0, 0, 1_000]);
  });

  it("is ten a second by default, which is the Developer plan", () => {
    expect(JUPITER_RPS).toBe(10);
  });

  it("leaves a keyless deployment alone, with nothing shared to pace", () => {
    expect(jupiterAccess([])).toBeUndefined();
  });
});
