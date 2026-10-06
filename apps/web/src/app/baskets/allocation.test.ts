import { describe, expect, it } from "vitest";
import { allocationRows } from "./allocation";

describe("allocationRows", () => {
  it("keeps the largest seven holdings visible and preserves the remaining target weight", () => {
    const holdings = [400, 2000, 600, 1700, 300, 1400, 1600, 1000, 1000].map((weightBps, i) => ({
      ticker: `T${i}`,
      weightBps,
    }));
    const rows = allocationRows(holdings);
    const tiles = rows.flat();
    expect(tiles.map((tile) => tile.ticker)).toEqual(["T1", "T3", "T6", "T5", "T7", "T8", "T2", "Other"]);
    expect(tiles.at(-1)?.weightBps).toBe(700);
    const other = tiles.at(-1);
    expect(other?.kind).toBe("other");
    if (other?.kind === "other") expect(other.assets.map((asset) => asset.ticker)).toEqual(["T0", "T4"]);
    expect(tiles.reduce((total, tile) => total + tile.weightBps, 0)).toBe(10_000);
    expect(rows.map((row) => row.length)).toEqual([2, 2, 4]);
  });
});
