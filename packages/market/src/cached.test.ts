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

describe("CachedPriceBoard", () => {
  it("answers a repeat ask inside the window from memory", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, { ttlMs: 5_000, now: () => now });
    await cached.pricesFor(["A", "B"]);
    now = 4_999;
    const again = await cached.pricesFor(["A", "B"]);
    expect(up.calls).toEqual([["A", "B"]]);
    expect(again.get("A")?.usdPricePerToken.toFixed()).toBe("10");
  });

  it("asks upstream only for what it does not hold, and again once the window passes", async () => {
    const up = upstream();
    let now = 0;
    const cached = new CachedPriceBoard(up.board, { ttlMs: 5_000, now: () => now });
    await cached.pricesFor(["A"]);
    await cached.pricesFor(["A", "B"]);
    now = 5_000;
    await cached.pricesFor(["A"]);
    expect(up.calls).toEqual([["A"], ["B"], ["A"]]);
  });

  it("shares one upstream call between callers asking at the same time", async () => {
    const up = upstream();
    const cached = new CachedPriceBoard(up.board);
    up.holdNext();
    const first = cached.pricesFor(["A", "B"]);
    const second = cached.pricesFor(["B", "C"]);
    up.release();
    const [a, b] = await Promise.all([first, second]);
    expect(up.calls).toEqual([["A", "B"], ["C"]]);
    expect([...a.keys()].sort()).toEqual(["A", "B"]);
    expect([...b.keys()].sort()).toEqual(["B", "C"]);
  });

  it("remembers that a mint has no price, rather than asking every time", async () => {
    const up = upstream();
    const cached = new CachedPriceBoard(up.board);
    expect((await cached.pricesFor(["UNPRICED"])).size).toBe(0);
    expect((await cached.pricesFor(["UNPRICED"])).size).toBe(0);
    expect(up.calls).toHaveLength(1);
  });

  it("does not remember a failure, so the next caller tries again", async () => {
    let fail = true;
    let calls = 0;
    const cached = new CachedPriceBoard({
      pricesFor: async (mints) => {
        calls += 1;
        if (fail) throw new Error("jupiter price/v3 returned 429");
        return new Map(mints.map((m) => [m, price(m)]));
      },
    });
    await expect(cached.pricesFor(["A"])).rejects.toThrow("429");
    fail = false;
    expect((await cached.pricesFor(["A"])).has("A")).toBe(true);
    expect(calls).toBe(2);
  });
});
