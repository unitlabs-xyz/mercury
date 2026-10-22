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
    const c = cadence({ here: p, idleMs: 60_000, now: () => now });
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
