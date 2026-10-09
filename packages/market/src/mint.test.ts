import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { ChainReader, MintConfig } from "@mercury/chain";
import { MintMultipliers } from "./mint.js";

const chainWith = (configs: Record<string, MintConfig | null>): ChainReader => ({
  tokenBalances: async () => [],
  mintConfig: async (mint) => configs[mint] ?? null,
});

/** The same fixture, through a reader that can answer many accounts at once. */
const batchChainWith = (configs: Record<string, MintConfig | null>) => {
  const singles: string[] = [];
  const batches: string[][] = [];
  const chain: ChainReader = {
    tokenBalances: async () => [],
    mintConfig: async (mint) => {
      singles.push(mint);
      return configs[mint] ?? null;
    },
    mintConfigs: async (mints) => {
      batches.push([...mints]);
      const found = new Map<string, MintConfig>();
      for (const mint of mints) {
        const config = configs[mint];
        if (config !== undefined && config !== null) found.set(mint, config);
      }
      return found;
    },
  };
  return { chain, singles, batches };
};

const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const ONE_ISH = D("1.001701196801074");

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

describe("MintMultipliers", () => {
  it("returns the multiplier the mint is carrying", async () => {
    const m = new MintMultipliers({
      chain: chainWith({ [NVDAX]: { decimals: 8, multiplier: D("1.001701196801074"), isPaused: false } }),
    });
    expect((await m.multiplierFor(NVDAX))!.toFixed()).toBe("1.001701196801074");
  });

  it("says null for a mint that does not exist, which is not the same as one", async () => {
    const m = new MintMultipliers({ chain: chainWith({}) });
    expect(await m.multiplierFor("NotAMint")).toBeNull();
  });

  it("reports a halted token", async () => {
    const m = new MintMultipliers({
      chain: chainWith({ [NVDAX]: { decimals: 8, multiplier: D(1), isPaused: true } }),
    });
    expect(await m.isPaused(NVDAX)).toBe(true);
  });

  it("does not call a token halted just because we cannot find it", async () => {
    // A mint we cannot read is a mint we know nothing about. Refusing to trade
    // it belongs to the decision path, which already refuses a candidate with no
    // multiplier; claiming the issuer halted it would be a different, false story.
    const m = new MintMultipliers({ chain: chainWith({}) });
    expect(await m.isPaused("NotAMint")).toBe(false);
  });

  it("reads the mint once when both questions are asked about it", async () => {
    let calls = 0;
    const chain: ChainReader = {
      tokenBalances: async () => [],
      mintConfig: async () => {
        calls += 1;
        return { decimals: 8, multiplier: D(1), isPaused: false };
      },
    };
    const m = new MintMultipliers({ chain });
    await Promise.all([m.multiplierFor(NVDAX), m.isPaused(NVDAX)]);
    expect(calls).toBe(1);
  });
});

describe("MintMultipliers.multipliersFor", () => {
  it("reads every mint in one call where the reader can do that", async () => {
    const c = batchChainWith({
      [NVDAX]: { decimals: 8, multiplier: ONE_ISH, isPaused: false },
      [SPYX]: { decimals: 8, multiplier: D(1), isPaused: false },
    });
    const found = await new MintMultipliers({ chain: c.chain }).multipliersFor([NVDAX, SPYX]);
    expect(found.get(NVDAX)!.toFixed()).toBe("1.001701196801074");
    expect(c.batches).toEqual([[NVDAX, SPYX]]);
    // One `getMultipleAccounts` rather than two `getAccountInfo`: the node bills
    // what it is asked, however few requests carry the asking.
    expect(c.singles).toEqual([]);
  });

  it("falls back to one call per mint when the reader cannot answer many", async () => {
    let calls = 0;
    const chain: ChainReader = {
      tokenBalances: async () => [],
      mintConfig: async () => {
        calls += 1;
        return { decimals: 8, multiplier: D(1), isPaused: false };
      },
    };
    const found = await new MintMultipliers({ chain }).multipliersFor([NVDAX, SPYX]);
    expect(found.size).toBe(2);
    expect(calls).toBe(2);
  });

  it("leaves out a mint it could not read, rather than calling it one", async () => {
    // One would be a claim about the token, and the wrong one: it would restate
    // the share count of everybody holding a mint that has paid a dividend.
    const c = batchChainWith({ [NVDAX]: { decimals: 8, multiplier: ONE_ISH, isPaused: false } });
    const found = await new MintMultipliers({ chain: c.chain }).multipliersFor([NVDAX, "NotAMint"]);
    expect([...found.keys()]).toEqual([NVDAX]);
  });

  it("asks only about the mints it is not already holding", async () => {
    const c = batchChainWith({
      [NVDAX]: { decimals: 8, multiplier: D(1), isPaused: false },
      [SPYX]: { decimals: 8, multiplier: D(1), isPaused: false },
    });
    const m = new MintMultipliers({ chain: c.chain });
    await m.multipliersFor([NVDAX]);
    await m.multipliersFor([NVDAX, SPYX]);
    expect(c.batches).toEqual([[NVDAX], [SPYX]]);
  });

  it("reads again once the window passes", async () => {
    const c = batchChainWith({ [NVDAX]: { decimals: 8, multiplier: D(1), isPaused: false } });
    let now = 0;
    const m = new MintMultipliers({ chain: c.chain, ttlMs: 60_000, now: () => now });
    await m.multipliersFor([NVDAX]);
    now = 59_999;
    await m.multipliersFor([NVDAX]);
    expect(c.batches).toHaveLength(1);
    now = 60_000;
    await m.multipliersFor([NVDAX]);
    expect(c.batches).toHaveLength(2);
  });

  it("does not remember a failure, so the next caller tries again", async () => {
    let fail = true;
    let calls = 0;
    const chain: ChainReader = {
      tokenBalances: async () => [],
      mintConfig: async () => null,
      mintConfigs: async (mints) => {
        calls += 1;
        if (fail) throw new Error("solana getMultipleAccounts returned 429");
        return new Map(mints.map((m) => [m, { decimals: 8, multiplier: D(1), isPaused: false }]));
      },
    };
    const m = new MintMultipliers({ chain });
    await expect(m.multipliersFor([NVDAX])).rejects.toThrow("429");
    fail = false;
    // A rejected promise kept in the cache would have handed this caller the
    // same error for the rest of the minute.
    expect((await m.multipliersFor([NVDAX])).has(NVDAX)).toBe(true);
    expect(calls).toBe(2);
  });

  it("shares one read between the three questions asked of one mint", async () => {
    const c = batchChainWith({ [NVDAX]: { decimals: 8, multiplier: ONE_ISH, isPaused: false } });
    const m = new MintMultipliers({ chain: c.chain });
    await Promise.all([m.multipliersFor([NVDAX]), m.multiplierFor(NVDAX), m.isPaused(NVDAX)]);
    expect(c.batches).toEqual([[NVDAX]]);
  });
});
