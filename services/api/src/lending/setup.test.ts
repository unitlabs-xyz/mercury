import { describe, expect, it } from "vitest";
import { Obligation, UserMetadata, UserState } from "@kamino-finance/klend-sdk";
import { KAMINO_SETUP_BYTES, kaminoSetupRent } from "./setup.js";

describe("what a first loan opens on Kamino", () => {
  /* Each account is its 8-byte discriminator and then the layout the SDK reads it with. */
  it("sizes each account as Kamino's own layouts do", () => {
    expect(KAMINO_SETUP_BYTES.obligation).toBe(8 + Obligation.layout.span);
    expect(KAMINO_SETUP_BYTES.userMetadata).toBe(8 + UserMetadata.layout.span);
    expect(KAMINO_SETUP_BYTES.farmState).toBe(8 + UserState.layout.span);
  });

  /* What mainnet held in each, measured on 15 October 2026: 17,637,760 + 5,892,800 + 5,323,840. */
  it("costs the rent of all three", async () => {
    expect(await kaminoSetupRent({})).toBe(28_854_400n);
  });

  it("asks the node for each size", async () => {
    const asked: number[] = [];
    const rent = await kaminoSetupRent({
      rentExemption: async (bytes) => {
        asked.push(bytes);
        return 1n;
      },
    });
    expect(rent).toBe(3n);
    expect(asked.sort((a, b) => a - b)).toEqual([920, 1_032, 3_344]);
  });
});
