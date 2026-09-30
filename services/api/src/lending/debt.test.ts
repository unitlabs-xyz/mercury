import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import type { LendingPosition, LendingSource } from "./ports.js";
import { debtFrom } from "./debt.js";

const lending = (position: () => Promise<LendingPosition | null>): LendingSource =>
  ({ position }) as unknown as LendingSource;

const owing = (usd: string): LendingPosition =>
  ({ obligation: "ob", deposits: [], debtUsd: D(usd) }) as unknown as LendingPosition;

/**
 * Three answers, and the difference between two of them is the whole point.
 *
 * `pledged` treats an unreadable Kamino as nothing pledged, which makes a
 * holder look poorer — wrong in the harmless direction. The same shrug about
 * debt makes a borrower look solvent, which is the direction that ends in a
 * liquidation they were never warned about. So nothing owed is zero, and not
 * knowing is null, and callers have to tell them apart.
 */
describe("debtFrom", () => {
  it("reports what is owed", async () => {
    expect((await debtFrom(lending(async () => owing("5000.25")), "W"))?.toFixed(2)).toBe("5000.25");
  });

  it("reports zero for an account with no obligation, which is knowing, not guessing", async () => {
    expect(await debtFrom(lending(async () => null), "W")).toEqual(ZERO);
  });

  it("reports null when Kamino cannot be read, never zero", async () => {
    const down = lending(() => Promise.reject(new Error("rpc down")));
    expect(await debtFrom(down, "W")).toBeNull();
  });
});
