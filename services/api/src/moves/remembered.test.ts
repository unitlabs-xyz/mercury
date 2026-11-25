import { describe, expect, it } from "vitest";
import { remembered } from "./remembered.js";

describe("remembered", () => {
  it("answers a wallet from what it kept until the time is up, then looks again", async () => {
    let at = 0;
    let looked = 0;
    const read = remembered(
      1_000,
      async (w: { walletId: string }) => `${w.walletId}:${++looked}`,
      () => at,
    );
    expect(await read({ walletId: "a" })).toBe("a:1");
    at = 999;
    expect(await read({ walletId: "a" })).toBe("a:1");
    expect(await read({ walletId: "b" })).toBe("b:2");
    at = 1_000;
    expect(await read({ walletId: "a" })).toBe("a:3");
  });

  it("keeps no failure, so the next look tries again", async () => {
    let fail = true;
    const read = remembered(60_000, async () => {
      if (fail) throw new Error("node down");
      return "ok";
    });
    await expect(read({ walletId: "a" })).rejects.toThrow("node down");
    fail = false;
    expect(await read({ walletId: "a" })).toBe("ok");
  });
});
