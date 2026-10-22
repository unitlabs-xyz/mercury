import { describe, expect, it } from "vitest";
import { onlyIfUsed } from "./gate.js";

describe("onlyIfUsed", () => {
  /*
   * Every portfolio, money and snapshot read used to ask Kamino and the node
   * about Earn for every account, and an hourly snapshot skipped every account,
   * Earn or not, when Kamino's API was down at boot.
   */
  it("never reads Earn for an account that has not used it", async () => {
    let reads = 0;
    const earn = onlyIfUsed(
      async () => false,
      async () => {
        reads += 1;
        throw new Error("kamino down");
      },
      "nothing",
    );
    expect(await earn("WaLLeT")).toBe("nothing");
    expect(reads).toBe(0);
  });

  it("reads it for one that has, failures and all", async () => {
    const earn = onlyIfUsed(
      async () => true,
      async (wallet: string) => `read ${wallet}`,
      "nothing",
    );
    expect(await earn("WaLLeT")).toBe("read WaLLeT");
    const failing = onlyIfUsed(
      async () => true,
      async () => Promise.reject(new Error("kamino down")),
      "x",
    );
    await expect(failing("WaLLeT")).rejects.toThrow("kamino down");
  });
});
