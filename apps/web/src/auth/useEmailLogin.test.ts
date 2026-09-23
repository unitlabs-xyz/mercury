import { describe, expect, it, vi } from "vitest";
import { atLeast } from "./useEmailLogin.js";

describe("atLeast", () => {
  it("holds a fast result until the floor elapses", async () => {
    vi.useFakeTimers();
    const started = Date.now();
    let settledAt = 0;
    const p = atLeast(800, Promise.resolve("ok")).then((v) => {
      settledAt = Date.now();
      return v;
    });
    await vi.advanceTimersByTimeAsync(799);
    expect(settledAt).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe("ok");
    expect(settledAt - started).toBe(800);
    vi.useRealTimers();
  });

  it("does not delay a result that was already slower than the floor", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((r) => setTimeout(() => r("ok"), 1500));
    const p = atLeast(800, slow);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toBe("ok");
    vi.useRealTimers();
  });

  it("propagates a rejection without waiting out the floor", async () => {
    vi.useFakeTimers();
    const p = atLeast(800, Promise.reject(new Error("nope")));
    await expect(p).rejects.toThrow("nope");
    vi.useRealTimers();
  });
});
