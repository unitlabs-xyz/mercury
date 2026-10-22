import { describe, expect, it } from "vitest";
import { cadence, presence } from "./presence.js";

describe("presence", () => {
  it("counts a wallet as here for two minutes after its owner's last request", () => {
    let now = 0;
    const p = presence({ now: () => now });
    expect(p.here("W")).toBe(false);
    p.seen("W");
    now = 119_999;
    expect(p.here("W")).toBe(true);
    now = 120_000;
    expect(p.here("W")).toBe(false);
  });
});

describe("cadence", () => {
  /*
   * position-sync read all seventeen wallets every two seconds, whether or not
   * anyone was looking. Two seconds is for the person watching their deposit
   * land; nobody else needs it.
   */
  it("reads a wallet whose owner is here on every pass, and anyone else once a minute", () => {
    let now = 0;
    const p = presence({ now: () => now });
    // First spots at zero, so this is about the cadence after a first read; the spread is tested below.
    const c = cadence({ here: p, idleMs: 60_000, now: () => now, spread: () => 0 });
    p.seen("Here");
    expect(c.due("Here")).toBe(true);
    expect(c.due("Away")).toBe(true);
    c.read("Here");
    c.read("Away");
    now = 2_000;
    expect(c.due("Here")).toBe(true);
    expect(c.due("Away")).toBe(false);
    now = 60_000;
    expect(c.due("Away")).toBe(true);
  });
});

describe("cadence, right after boot", () => {
  /*
   * Every wallet is unread at boot, so every wallet was due on the first pass:
   * seventeen reads in the same second, and the node refused them.
   */
  it("spreads each wallet's first read across the first idle window", () => {
    let now = 0;
    const p = presence({ now: () => now });
    const offsets: Record<string, number> = { Early: 0, Late: 45_000 };
    const c = cadence({ here: p, idleMs: 60_000, now: () => now, spread: (w) => offsets[w] ?? 0 });
    expect(c.due("Early")).toBe(true);
    expect(c.due("Late")).toBe(false);
    now = 45_000;
    expect(c.due("Late")).toBe(true);
  });

  it("reads a wallet whose owner is here at once, whatever its spot", () => {
    const p = presence({ now: () => 0 });
    const c = cadence({ here: p, idleMs: 60_000, now: () => 0, spread: () => 59_000 });
    p.seen("Here");
    expect(c.due("Here")).toBe(true);
  });

  it("gives every wallet a spot inside the window by default, the same one each time", () => {
    const c = cadence({ here: presence(), idleMs: 60_000 });
    const spots = ["A", "B", "WaLLeT"].map((w) => c.spotOf(w));
    for (const spot of spots) expect(spot).toBeGreaterThanOrEqual(0);
    for (const spot of spots) expect(spot).toBeLessThan(60_000);
    expect(c.spotOf("WaLLeT")).toBe(spots[2]);
  });
});
