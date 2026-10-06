import { describe, expect, it } from "vitest";
import { batchedLoader } from "./batch.js";

const recording = () => {
  const calls: string[][] = [];
  const loadMany = async (keys: readonly string[]) => {
    calls.push([...keys]);
    return new Map(keys.filter((k) => k !== "none").map((k) => [k, k.toUpperCase()]));
  };
  return { calls, loadMany };
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("batchedLoader", () => {
  it("loads every key asked for inside the window in one call, answering each caller its own", async () => {
    const { calls, loadMany } = recording();
    const load = batchedLoader(loadMany, null, 20);
    const a = load("a");
    await pause(5);
    const b = load("b");
    expect(await Promise.all([a, b])).toEqual(["A", "B"]);
    expect(calls).toEqual([["a", "b"]]);
  });

  it("loads a key asked for twice once, and answers both", async () => {
    const { calls, loadMany } = recording();
    const load = batchedLoader(loadMany, null, 5);
    expect(await Promise.all([load("a"), load("a")])).toEqual(["A", "A"]);
    expect(calls).toEqual([["a"]]);
  });

  it("answers a key the load did not return with the missing value", async () => {
    const { loadMany } = recording();
    expect(await batchedLoader(loadMany, null, 1)("none")).toBeNull();
  });

  it("starts a new batch after the window closes", async () => {
    const { calls, loadMany } = recording();
    const load = batchedLoader(loadMany, null, 5);
    await load("a");
    await load("b");
    expect(calls).toEqual([["a"], ["b"]]);
  });

  it("fails every caller in a failed batch, and the next batch tries again", async () => {
    let fail = true;
    const load = batchedLoader(
      async (keys: readonly string[]) => {
        if (fail) throw new Error("429");
        return new Map(keys.map((k) => [k, k]));
      },
      null,
      1,
    );
    const results = await Promise.allSettled([load("a"), load("b")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    fail = false;
    expect(await load("a")).toBe("a");
  });
});
