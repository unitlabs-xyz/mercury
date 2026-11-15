import { describe, expect, it } from "vitest";
import { pushed } from "./pushed.js";

const A = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const B = "Wa11etBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("pushed", () => {
  it("reads a wallet the node said something about", () => {
    // Far enough into the window that neither wallet is due of its own accord.
    const p = pushed({ live: () => true, spread: () => 5_000, now: () => 0 });
    expect(p.due(A)).toBe(false);

    p.changed(A);

    expect(p.due(A)).toBe(true);
    expect(p.due(B)).toBe(false);
  });

  it("stops reading a wallet once its news has been read", () => {
    let now = 0;
    const p = pushed({ live: () => true, spread: () => 0, now: () => now, sweepMs: 1_000 });
    p.changed(A);
    p.read(A);

    expect(p.due(A)).toBe(false);
    now = 999;
    expect(p.due(A)).toBe(false);
  });

  it("keeps news that arrived while the wallet was being read", () => {
    const p = pushed({ live: () => true, spread: () => 0, now: () => 0 });
    p.changed(A);
    p.read(A);
    // The socket heard something else while the pass was still running.
    p.changed(A);

    expect(p.due(A)).toBe(true);
  });

  it("reads every wallet now and then anyway, in case the stream missed one", () => {
    let now = 0;
    const p = pushed({ live: () => true, spread: () => 0, now: () => now, sweepMs: 10_000 });
    p.read(A);

    now = 9_999;
    expect(p.due(A)).toBe(false);
    now = 10_000;
    expect(p.due(A)).toBe(true);
  });

  it("gives a wallet nobody has read its own spot in the first sweep, not the moment of boot", () => {
    let now = 0;
    const p = pushed({
      live: () => true,
      now: () => now,
      sweepMs: 10_000,
      spread: (wallet) => (wallet === A ? 2_000 : 8_000),
    });

    expect([p.due(A), p.due(B)]).toEqual([false, false]);
    now = 2_000;
    expect([p.due(A), p.due(B)]).toEqual([true, false]);
    now = 8_000;
    expect([p.due(A), p.due(B)]).toEqual([true, true]);
  });

  it("spreads wallets across the window without being told how", () => {
    const p = pushed({ live: () => true, now: () => 0, sweepMs: 10_000 });
    expect(p.spotOf(A)).toBeGreaterThanOrEqual(0);
    expect(p.spotOf(A)).toBeLessThan(10_000);
    expect(p.spotOf(A)).not.toBe(p.spotOf(B));
  });

  it("reads every wallet while nothing is streaming", () => {
    let live = false;
    const p = pushed({ live: () => live, spread: () => 999_999, now: () => 0, sweepMs: 10_000 });

    expect([p.due(A), p.due(B)]).toEqual([true, true]);
    live = true;
    expect([p.due(A), p.due(B)]).toEqual([false, false]);
  });

  it("leaves a pass with no stream to whatever decided it before", () => {
    const asked: string[] = [];
    const wasRead: string[] = [];
    const p = pushed({
      live: () => false,
      spread: () => 999_999,
      now: () => 0,
      blind: {
        due: (wallet) => (asked.push(wallet), wallet === A),
        read: (wallet) => void wasRead.push(wallet),
      },
    });

    expect([p.due(A), p.due(B)]).toEqual([true, false]);
    expect(asked).toEqual([A, B]);

    p.read(A);
    expect(wasRead).toEqual([A]);
  });

  it("reads a wallet the node spoke about even while the stream is down", () => {
    const p = pushed({
      live: () => false,
      spread: () => 999_999,
      now: () => 0,
      blind: { due: () => false, read: () => undefined },
    });
    p.changed(A);

    expect(p.due(A)).toBe(true);
  });

  it("keeps the fallback's own clock moving, so it is not stale when it is needed", () => {
    let live = true;
    const wasRead: string[] = [];
    const p = pushed({
      live: () => live,
      spread: () => 0,
      now: () => 0,
      blind: { due: () => false, read: (wallet) => void wasRead.push(wallet) },
    });

    p.changed(A);
    p.read(A);
    live = false;

    expect(wasRead).toEqual([A]);
  });

  it("forgets wallets that stop coming back, so it is bounded by who is here", () => {
    let now = 0;
    const p = pushed({ live: () => true, spread: () => 0, now: () => now, sweepMs: 1_000 });
    for (let i = 0; i < 5_000; i++) p.read(`Wa11et${String(i).padStart(38, "0")}`);

    now = 10 * 1_000;
    p.read(A);

    expect(p.size()).toBeLessThan(5_000);
  });
});
