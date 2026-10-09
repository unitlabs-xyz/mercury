import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import { CachedPriceBoard } from "./cached.js";
import type { PriceBoard, TokenPrice } from "./ports.js";

const price = (mint: string): TokenPrice => ({
  mint,
  usdPricePerToken: D(10),
  pricePerShare: D(10),
  changePct24h: null,
  liquidityUsd: ZERO,
  multiplier: D(1),
  observedAt: null,
});

/** Prices every mint except `UNPRICED`, and records what each upstream call asked for. */
const upstream = () => {
  const calls: string[][] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const board: PriceBoard = {
    pricesFor: async (mints) => {
      calls.push([...mints]);
      if (hold) {
        hold = false;
        await new Promise<void>((r) => (release = r));
      }
      return new Map(mints.filter((m) => m !== "UNPRICED").map((m) => [m, price(m)]));
    },
  };
  return {
    board,
    calls,
    holdNext: () => (hold = true),
    release: () => release?.(),
  };
};

/**
 * Closes the batch the moment it opens, which is what most of these tests want:
 * they are about the memory, not the window. The window has its own tests, and
 * they hold the flush by hand.
 */
const immediately = (flush: () => void) => flush();

describe("CachedPriceBoard", () => {
  it("answers a repeat ask inside the window from memory", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, {
      ttlMs: 5_000,
      now: () => now,
      schedule: immediately,
    });
    await cached.pricesFor(["A", "B"]);
    now = 4_999;
    const again = await cached.pricesFor(["A", "B"]);
    expect(up.calls).toEqual([["A", "B"]]);
    expect(again.get("A")?.usdPricePerToken.toFixed()).toBe("10");
  });

  it("asks upstream only for what it does not hold, and again once the window passes", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, {
      ttlMs: 5_000,
      now: () => now,
      schedule: immediately,
    });
    await cached.pricesFor(["A"]);
    await cached.pricesFor(["A", "B"]);
    now = 5_000;
    await cached.pricesFor(["A"]);
    expect(up.calls).toEqual([["A"], ["B"], ["A"]]);
  });

  it("remembers that a mint has no price, rather than asking every time", async () => {
    const up = upstream();
    const cached = new CachedPriceBoard(up.board, { schedule: immediately });
    expect((await cached.pricesFor(["UNPRICED"])).size).toBe(0);
    expect((await cached.pricesFor(["UNPRICED"])).size).toBe(0);
    expect(up.calls).toHaveLength(1);
  });

  it("does not remember a failure, so the next caller tries again", async () => {
    let fail = true;
    let calls = 0;
    const cached = new CachedPriceBoard(
      {
        pricesFor: async (mints) => {
          calls += 1;
          if (fail) throw new Error("jupiter price/v3 returned 429");
          return new Map(mints.map((m) => [m, price(m)]));
        },
      },
      { schedule: immediately },
    );
    await expect(cached.pricesFor(["A"])).rejects.toThrow("429");
    fail = false;
    expect((await cached.pricesFor(["A"])).has("A")).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("CachedPriceBoard, the batch window", () => {
  /** Collects the flushes rather than running them, so a test closes a batch when it chooses. */
  const manual = () => {
    const flushes: (() => void)[] = [];
    return { flushes, schedule: (flush: () => void) => flushes.push(flush) };
  };

  it("sends one request for callers asking at the same moment for different mints", async () => {
    const up = upstream();
    const clock = manual();
    const cached = new CachedPriceBoard(up.board, { schedule: clock.schedule });

    const first = cached.pricesFor(["A", "B"]);
    const second = cached.pricesFor(["B", "C"]);
    // The point of the window: one of these, not one each. Without it the
    // second caller's "C" paid for a whole request of its own.
    expect(clock.flushes).toHaveLength(1);

    clock.flushes[0]!();
    const [a, b] = await Promise.all([first, second]);
    expect(up.calls).toEqual([["A", "B", "C"]]);
    expect([...a.keys()].sort()).toEqual(["A", "B"]);
    expect([...b.keys()].sort()).toEqual(["B", "C"]);
  });

  it("waits on a request already gone upstream rather than opening another window", async () => {
    const up = upstream();
    const clock = manual();
    const cached = new CachedPriceBoard(up.board, { schedule: clock.schedule });

    up.holdNext();
    const first = cached.pricesFor(["A", "B"]);
    clock.flushes[0]!();

    // "B" is in flight now, so this caller joins the call rather than waiting
    // for a window that would ask for it a second time.
    const second = cached.pricesFor(["B"]);
    expect(clock.flushes).toHaveLength(1);

    up.release();
    const [, b] = await Promise.all([first, second]);
    expect(up.calls).toEqual([["A", "B"]]);
    expect(b.get("B")?.usdPricePerToken.toFixed()).toBe("10");
  });

  it("opens a fresh window for a mint asked for after the last batch went out", async () => {
    const up = upstream();
    const clock = manual();
    const cached = new CachedPriceBoard(up.board, { schedule: clock.schedule });

    const first = cached.pricesFor(["A"]);
    clock.flushes[0]!();
    await first;

    const second = cached.pricesFor(["B"]);
    expect(clock.flushes).toHaveLength(2);
    clock.flushes[1]!();
    await second;
    expect(up.calls).toEqual([["A"], ["B"]]);
  });
});

describe("CachedPriceBoard, a caller that wants it fresher", () => {
  it("re-reads an entry older than the age asked for, though the board still holds it", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, {
      ttlMs: 5_000,
      now: () => now,
      schedule: immediately,
    });
    await cached.pricesFor(["A"]);
    now = 1_500;

    // Inside the board's own five seconds, so an ordinary read is served from
    // memory — but a quote is checked against this number, and 1.5s is older
    // than it accepts.
    await cached.pricesFor(["A"]);
    expect(up.calls).toHaveLength(1);
    await cached.pricesFor(["A"], { maxAgeMs: 1_000 });
    expect(up.calls).toEqual([["A"], ["A"]]);
  });

  it("serves the age asked for from memory when the entry is new enough", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, { now: () => now, schedule: immediately });
    await cached.pricesFor(["A"]);
    now = 999;
    await cached.pricesFor(["A"], { maxAgeMs: 1_000 });
    expect(up.calls).toHaveLength(1);
  });

  it("refreshes the shared entry, so the next ordinary reader is served from memory", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, {
      ttlMs: 5_000,
      now: () => now,
      schedule: immediately,
    });
    await cached.pricesFor(["A"]);
    now = 2_000;
    await cached.pricesFor(["A"], { maxAgeMs: 1_000 });
    // One memory, not one per standard of freshness: the quote's re-read is
    // what the portfolio read a moment later is answered from.
    now = 3_000;
    await cached.pricesFor(["A"]);
    expect(up.calls).toEqual([["A"], ["A"]]);
  });

  it("cannot be asked for something staler than the board keeps", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, {
      ttlMs: 1_000,
      now: () => now,
      schedule: immediately,
    });
    await cached.pricesFor(["A"]);
    now = 1_200;
    // The entry is past the board's own window; a generous `maxAgeMs` does not
    // resurrect it, because nothing is being kept to serve.
    await cached.pricesFor(["A"], { maxAgeMs: 60_000 });
    expect(up.calls).toEqual([["A"], ["A"]]);
  });
});
