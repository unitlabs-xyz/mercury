import { describe, expect, it } from "vitest";
import { Expiring } from "../cache.js";

const at = (clock: { now: number }) => () => clock.now;

describe("Expiring", () => {
  it("serves a value back until its time is up", () => {
    const clock = { now: 0 };
    const cache = new Expiring<string>(10, at(clock));
    cache.set("a", "one", 100);

    clock.now = 99;
    expect(cache.get("a")).toBe("one");
    clock.now = 100;
    expect(cache.get("a")).toBeUndefined();
  });

  // Why the cap exists: a person mints a strategy id every time they write a basket.
  it("never holds more than its capacity", () => {
    const cache = new Expiring<number>(3);
    for (let i = 0; i < 50; i++) cache.set(`k${i}`, i, 60_000);
    expect(cache.size).toBe(3);
    expect(cache.get("k49")).toBe(49);
    expect(cache.get("k0")).toBeUndefined();
  });

  it("evicts what was read longest ago, not what was written longest ago", () => {
    const cache = new Expiring<string>(2);
    cache.set("a", "one", 60_000);
    cache.set("b", "two", 60_000);
    expect(cache.get("a")).toBe("one"); // "a" is now the recent one
    cache.set("c", "three", 60_000);

    expect(cache.get("a")).toBe("one");
    expect(cache.get("b")).toBeUndefined();
  });

  /* A cached "Glider has no curve for this" is an answer, not a miss. */
  it("tells a cached null apart from nothing cached", () => {
    const cache = new Expiring<string | null>(2);
    cache.set("a", null, 60_000);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeUndefined();
  });

  it("drops an expired key rather than leaving it to fill the cache", () => {
    const clock = { now: 0 };
    const cache = new Expiring<string>(10, at(clock));
    cache.set("a", "one", 100);
    clock.now = 200;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
