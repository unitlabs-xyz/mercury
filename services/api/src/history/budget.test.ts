import { describe, expect, it } from "vitest";
import type { ChainHistory } from "@mercury/chain";
import {
  CLIMB_AFTER,
  MIN_RPS,
  RateLimited,
  REFUSAL_PAUSE_MS,
  budget,
  budgeted,
  isRateLimit,
} from "./budget.js";

/** A clock that only moves when the budget sleeps. */
const clock = () => {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    advance: (ms: number) => void (t += ms),
    slept,
  };
};

describe("budget", () => {
  it("spaces calls evenly at its rate, and never faster", async () => {
    const c = clock();
    const b = budget({ rps: 2, now: c.now, sleep: c.sleep });
    for (let i = 0; i < 4; i++) await b.take();
    // The first goes at once; each after waits half a second.
    expect(c.slept).toEqual([500, 500, 500]);
  });

  it("queues calls made together rather than letting them collide", async () => {
    const c = clock();
    const b = budget({ rps: 2, now: c.now, sleep: async (ms) => void c.slept.push(ms) });
    await Promise.all([b.take(), b.take(), b.take()]);
    expect(c.slept).toEqual([500, 1000]);
  });

  it("does not wait at all once its slot has passed", async () => {
    const c = clock();
    const b = budget({ rps: 2, now: c.now, sleep: c.sleep });
    await b.take();
    c.advance(5_000);
    await b.take();
    expect(c.slept).toEqual([]);
  });

  it("stops for a minute after a refusal, then goes at half the rate", async () => {
    const c = clock();
    const b = budget({ rps: 2, now: c.now, sleep: c.sleep });
    await b.take();
    b.refused();
    await expect(b.take()).rejects.toBeInstanceOf(RateLimited);
    expect(b.rate()).toBe(1);

    c.advance(REFUSAL_PAUSE_MS);
    await b.take();
    await b.take();
    expect(c.slept).toEqual([1000]);
  });

  it("halves down to a floor and no lower", () => {
    const b = budget({ rps: 2, now: () => 0, sleep: async () => undefined });
    for (let i = 0; i < 20; i++) b.refused();
    expect(b.rate()).toBe(MIN_RPS);
  });

  it("climbs back, doubling, to its ceiling after a run of answered calls", () => {
    const b = budget({ rps: 2, now: () => 0, sleep: async () => undefined });
    b.refused();
    b.refused();
    expect(b.rate()).toBe(0.5);
    for (let i = 0; i < CLIMB_AFTER; i++) b.answered();
    expect(b.rate()).toBe(1);
    for (let i = 0; i < CLIMB_AFTER * 5; i++) b.answered();
    expect(b.rate()).toBe(2);
  });

  it("starts its climb again from nothing after another refusal", () => {
    const b = budget({ rps: 2, now: () => 0, sleep: async () => undefined });
    b.refused();
    for (let i = 0; i < CLIMB_AFTER - 1; i++) b.answered();
    b.refused();
    b.answered();
    expect(b.rate()).toBe(0.5);
  });
});

describe("isRateLimit", () => {
  it("knows the client's 429, and a node that says so in the body", () => {
    expect(isRateLimit(new Error("solana getSignaturesForAddress returned 429"))).toBe(true);
    expect(isRateLimit(new Error("solana getTransaction: Too many requests for a specific RPC call"))).toBe(
      true,
    );
    expect(isRateLimit(new Error("solana getTransaction: -32029 rate limited"))).toBe(true);
  });

  it("is not fooled by other failures", () => {
    expect(isRateLimit(new Error("solana getTransaction returned 500"))).toBe(false);
    expect(isRateLimit(new Error("solana getTransaction returned 4290"))).toBe(false);
    expect(isRateLimit("429")).toBe(false);
  });
});

describe("budgeted", () => {
  const history = (over: Partial<ChainHistory> = {}): ChainHistory => ({
    tokenAccountsFor: async () => [],
    signatures: async () => [],
    transaction: async () => null,
    ...over,
  });

  it("makes every call wait its turn", async () => {
    const c = clock();
    const h = budgeted(history(), budget({ rps: 1, now: c.now, sleep: c.sleep }));
    await h.signatures("acct", { limit: 10 });
    await h.transaction("sig");
    expect(c.slept).toEqual([1000]);
  });

  it("counts a token account listing as the two calls it makes", async () => {
    const c = clock();
    const h = budgeted(
      history({ ownedTokenAccounts: async () => [] }),
      budget({ rps: 1, now: c.now, sleep: c.sleep }),
    );
    await h.ownedTokenAccounts!("owner");
    expect(c.slept).toEqual([1000]);
  });

  it("turns a refusal into a stop, rather than letting the client retry at the node", async () => {
    const c = clock();
    const b = budget({ rps: 2, now: c.now, sleep: c.sleep });
    let asked = 0;
    const h = budgeted(
      history({
        transaction: async () => {
          asked += 1;
          throw new Error("solana getTransaction returned 429");
        },
      }),
      b,
    );
    await expect(h.transaction("sig")).rejects.toBeInstanceOf(RateLimited);
    // Stopped: the next call is refused here, without asking the node.
    await expect(h.signatures("acct", { limit: 1 })).rejects.toBeInstanceOf(RateLimited);
    expect(asked).toBe(1);
    expect(b.rate()).toBe(1);
  });

  it("passes any other failure through, as is", async () => {
    const h = budgeted(
      history({
        transaction: async () => {
          throw new Error("solana getTransaction returned 500");
        },
      }),
      budget({ rps: 100, now: () => 0, sleep: async () => undefined }),
    );
    await expect(h.transaction("sig")).rejects.toThrow("returned 500");
  });

  it("offers only the capabilities the client has", () => {
    const h = budgeted(history(), budget({ rps: 1 }));
    expect(h.tokenAccounts).toBeUndefined();
    expect(h.ownedTokenAccounts).toBeUndefined();
  });
});
