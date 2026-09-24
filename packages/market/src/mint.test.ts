import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { ChainReader, MintConfig } from "@mercury/chain";
import { MintMultipliers } from "./mint.js";

const chainWith = (configs: Record<string, MintConfig | null>): ChainReader => ({
  tokenBalances: async () => [],
  mintConfig: async (mint) => configs[mint] ?? null,
});

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
