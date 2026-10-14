import { describe, expect, it } from "vitest";
import { equalWeights, problemWith, type BasketDraft, type DraftProblem } from "./allocate.js";

const NVDA = "solana:x/spl:mint-nvda";
const TSLA = "solana:x/spl:mint-tsla";
const holdable = new Set([NVDA, TSLA]);

const draft = (over: Partial<BasketDraft> = {}): BasketDraft => ({
  name: "My AI Bet",
  description: "",
  assets: [{ assetId: NVDA, weightBps: 10_000 }],
  ...over,
});

const fifty = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ assetId: `solana:x/spl:mint-${i}`, weightBps: 1 }));

describe("problemWith", () => {
  it.each<{ name: string; draft: BasketDraft; expected: DraftProblem | null }>([
    { name: "a basket of one", draft: draft(), expected: null },
    {
      name: "two that add up",
      draft: draft({
        assets: [
          { assetId: NVDA, weightBps: 6000 },
          { assetId: TSLA, weightBps: 4000 },
        ],
      }),
      expected: null,
    },
    { name: "no name", draft: draft({ name: "   " }), expected: "name_required" },
    { name: "a name past the cap", draft: draft({ name: "a".repeat(61) }), expected: "name_too_long" },
    { name: "nothing in it", draft: draft({ assets: [] }), expected: "no_assets" },
    {
      name: "the same stock twice",
      draft: draft({
        assets: [
          { assetId: NVDA, weightBps: 5000 },
          { assetId: NVDA, weightBps: 5000 },
        ],
      }),
      expected: "duplicate_asset",
    },
    {
      name: "a stock the catalogue does not hold",
      draft: draft({ assets: [{ assetId: "solana:x/spl:mint-bonk", weightBps: 10_000 }] }),
      expected: "unknown_asset",
    },
    {
      name: "weights one bp short",
      draft: draft({ assets: [{ assetId: NVDA, weightBps: 9999 }] }),
      expected: "weights_must_total_10000",
    },
    {
      name: "weights one bp over",
      draft: draft({ assets: [{ assetId: NVDA, weightBps: 10_001 }] }),
      expected: "weights_must_total_10000",
    },
  ])("$name", ({ draft, expected }) => {
    expect(problemWith(draft, holdable)).toBe(expected);
  });

  /*
   * Glider's own ceiling, measured: 51 assets comes back
   * "expected array to have <=50 items". Catching it here keeps a request
   * that cannot succeed from writing a draft row first.
   */
  it("allows fifty stocks and refuses fifty-one", () => {
    const all = new Set(fifty(51).map((a) => a.assetId));
    const at = fifty(50);
    expect(
      problemWith(draft({ assets: [...at.slice(0, 49), { ...at[49]!, weightBps: 9951 }] }), all),
    ).toBeNull();
    expect(problemWith(draft({ assets: fifty(51) }), all)).toBe("too_many_assets");
  });

  /* Order matters: an unknown asset is worth saying before the weights. */
  it("names the unknown stock rather than the weights when both are wrong", () => {
    const bad = draft({ assets: [{ assetId: "solana:x/spl:mint-bonk", weightBps: 42 }] });
    expect(problemWith(bad, holdable)).toBe("unknown_asset");
  });
});

describe("equalWeights", () => {
  // The whole point: n slices that still add up to exactly 100.00%.
  it.each([1, 2, 3, 7, 11, 49, 50])("totals 10000 for %i", (count) => {
    const weights = equalWeights(count);
    expect(weights).toHaveLength(count);
    expect(weights.reduce((sum, bps) => sum + bps, 0)).toBe(10_000);
  });

  // Matches what the curated catalogue already stores for Magnificent Seven.
  it("puts the remainder on the last, as the catalogue does", () => {
    expect(equalWeights(7)).toEqual([1428, 1428, 1428, 1428, 1428, 1428, 1432]);
    expect(equalWeights(3)).toEqual([3333, 3333, 3334]);
    expect(equalWeights(1)).toEqual([10_000]);
  });

  // What levelling around a lock needs: fill exactly what the held weights left.
  it("fills a budget rather than the whole basket when given one", () => {
    expect(equalWeights(3, 6000)).toEqual([2000, 2000, 2000]);
    expect(equalWeights(3, 7000).reduce((sum, bps) => sum + bps, 0)).toBe(7000);
    expect(equalWeights(2, 0)).toEqual([0, 0]);
  });

  it("refuses a count that cannot be a basket", () => {
    expect(() => equalWeights(0)).toThrow(RangeError);
    expect(() => equalWeights(1.5)).toThrow(RangeError);
  });
});
