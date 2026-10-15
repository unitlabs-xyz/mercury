import { describe, expect, it } from "vitest";
import { STOCK_ACCOUNT_BYTES, TOKEN_ACCOUNT_BYTES, WALLET_BYTES, measuredRent, rentFor } from "./rent.js";

describe("measuredRent", () => {
  /* What mainnet answered for each size on 15 October 2026. */
  it("agrees with mainnet for every account we open", () => {
    expect(measuredRent(WALLET_BYTES)).toBe(650_240n);
    expect(measuredRent(TOKEN_ACCOUNT_BYTES)).toBe(1_488_440n);
    expect(measuredRent(STOCK_ACCOUNT_BYTES)).toBe(1_559_560n);
  });
});

describe("rentFor", () => {
  it("takes the node's figure when the reader can ask", async () => {
    const asked: number[] = [];
    const chain = {
      rentExemption: async (bytes: number) => {
        asked.push(bytes);
        return 7n;
      },
    };
    expect(await rentFor(chain, TOKEN_ACCOUNT_BYTES)).toBe(7n);
    expect(asked).toEqual([TOKEN_ACCOUNT_BYTES]);
  });

  it("uses the measured rate when the reader cannot ask", async () => {
    expect(await rentFor({}, TOKEN_ACCOUNT_BYTES)).toBe(1_488_440n);
  });

  /*
   * A node that cannot say is not a reason to refuse a trade or a loan. The
   * measured rate is the best figure left, and it is what everything charged
   * before the node was asked at all.
   */
  it("uses the measured rate when the node refuses", async () => {
    const chain = { rentExemption: () => Promise.reject(new Error("node is behind")) };
    expect(await rentFor(chain, STOCK_ACCOUNT_BYTES)).toBe(1_559_560n);
  });
});
