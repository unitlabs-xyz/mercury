import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import { planReconciliation, type HeldToken } from "./reconcile.js";

const NOW = new Date("2026-09-24T12:00:00Z");

/** One token, eight decimals, nothing recorded, nothing held. Tests change what they mean. */
const held = (over: Partial<HeldToken> = {}): HeldToken => ({
  tokenId: "token-nvdax",
  instrumentId: "instrument-nvda",
  mint: "Xsc9",
  symbol: "NVDAx",
  ticker: "NVDA",
  decimals: 8,
  multiplier: D(1),
  referencePricePerShare: D(200),
  chainRawAmount: 0n,
  recordedRawAmount: 0n,
  recordedShares: ZERO,
  recordedCostUsd: ZERO,
  ...over,
});

/** One whole token at eight decimals. */
const ONE_TOKEN = 100_000_000n;

describe("planReconciliation: tokens that arrived from outside", () => {
  it("counts them as held, and writes no lot for them", () => {
    // We did not witness the purchase, so we do not know what it cost. Pricing
    // a lot at today's reference would be a guess wearing the clothes of a
    // record, and every profit figure downstream would inherit it.
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
  });

  it("says plainly that it has no cost for them", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.positions).toEqual([
      {
        instrumentId: "instrument-nvda",
        shares: D(1),
        sharesWithBasisUsd: ZERO,
        costBasisUsd: ZERO,
        avgUnitCostUsd: ZERO,
      },
    ]);
  });

  it("counts shares at the multiplier in force, not at one", () => {
    const plan = planReconciliation(
      [held({ chainRawAmount: ONE_TOKEN, multiplier: D("1.001701196801074") })],
      NOW,
    );
    expect(plan.positions[0]!.shares.toFixed()).toBe("1.001701196801074");
  });

  it("does not call an arrival a dividend", () => {
    // A gap between the chain and our records means tokens came from somewhere
    // we did not see. Writing that off as a multiplier rise would hand the
    // holder the whole position as free shares.
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN, multiplier: D("1.5") })], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.positions[0]).toMatchObject({ shares: D("1.5"), sharesWithBasisUsd: ZERO });
  });
});

describe("planReconciliation: a dividend", () => {
  /** A token we hold a lot for: one token, one share, $200 paid. */
  const withLot = (over: Partial<HeldToken> = {}) =>
    held({
      chainRawAmount: ONE_TOKEN,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      recordedCostUsd: D(200),
      ...over,
    });

  it("writes a zero-cost lot when the multiplier has risen", () => {
    const plan = planReconciliation([withLot({ multiplier: D("1.5") })], NOW);
    expect(plan.lots).toEqual([
      {
        tokenId: "token-nvdax",
        instrumentId: "instrument-nvda",
        // A dividend adds shares, not tokens. The token count is unchanged.
        tokenQty: 0n,
        shares: D("0.5"),
        unitCostUsd: ZERO,
        source: "dividend",
        isEstimated: false,
        acquiredAt: NOW,
      },
    ]);
  });

  it("makes the average cost per share fall, which is the whole point", () => {
    // docs/05: recomputing shares from the current multiplier without writing
    // the lot would show a phantom gain and an overstated cost basis at once.
    const plan = planReconciliation([withLot({ multiplier: D("1.5") })], NOW);
    const position = plan.positions[0]!;
    expect(position.shares).toEqual(D("1.5"));
    expect(position.sharesWithBasisUsd).toEqual(D("1.5"));
    // The same money. More shares. Nothing was spent.
    expect(position.costBasisUsd).toEqual(D(200));
    expect(position.avgUnitCostUsd.toFixed(4)).toBe("133.3333");
  });

  it("writes the dividend once", () => {
    const after = withLot({ multiplier: D("1.5"), recordedShares: D("1.5") });
    expect(planReconciliation([after], NOW).lots).toEqual([]);
  });

  it("writes nothing at all when nothing moved", () => {
    const plan = planReconciliation([withLot()], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
  });
});

describe("planReconciliation: tokens that left", () => {
  it("follows the chain down and leaves the lots as history", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN / 2n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    expect(plan.lots).toEqual([]);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: D("0.5"),
      sharesWithBasisUsd: D("0.5"),
      costBasisUsd: D(100),
      // Average cost does not move when a position shrinks. That is what
      // average-cost accounting means, and it is why the scaling is pro rata.
      avgUnitCostUsd: D(200),
    });
  });

  it("writes no activity for it, because we do not know what happened", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: 0n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    expect(plan.activity).toEqual([]);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: ZERO,
      sharesWithBasisUsd: ZERO,
      costBasisUsd: ZERO,
      avgUnitCostUsd: ZERO,
    });
  });
});

describe("planReconciliation: rolling up", () => {
  it("adds two wrappers of one company into one position", () => {
    const backed = held({ chainRawAmount: ONE_TOKEN });
    const ondo = held({
      tokenId: "token-nvdaon",
      mint: "OnDo",
      symbol: "NVDAon",
      decimals: 6,
      chainRawAmount: 2_000_000n, // two whole tokens at six decimals
    });
    const plan = planReconciliation([backed, ondo], NOW);
    expect(plan.positions.length).toBe(1);
    expect(plan.positions[0]).toMatchObject({ instrumentId: "instrument-nvda", shares: D(3) });
  });

  it("adds the covered shares across wrappers too", () => {
    const backed = held({
      chainRawAmount: ONE_TOKEN,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      recordedCostUsd: D(200),
    });
    const ondo = held({ tokenId: "token-nvdaon", mint: "OnDo", decimals: 6, chainRawAmount: 2_000_000n });
    const plan = planReconciliation([backed, ondo], NOW);
    // Three shares held, one of them with a cost behind it.
    expect(plan.positions[0]).toMatchObject({
      shares: D(3),
      sharesWithBasisUsd: D(1),
      costBasisUsd: D(200),
      avgUnitCostUsd: D(200),
    });
  });

  it("keeps instruments apart", () => {
    const nvda = held({ chainRawAmount: ONE_TOKEN });
    const spy = held({
      tokenId: "token-spyx",
      instrumentId: "instrument-spy",
      symbol: "SPYx",
      ticker: "SPY",
      chainRawAmount: ONE_TOKEN,
    });
    const plan = planReconciliation([nvda, spy], NOW);
    expect(plan.positions.map((p) => p.instrumentId).sort()).toEqual(["instrument-nvda", "instrument-spy"]);
  });

  it("emits a zero position rather than no row, so a closed holding stops showing", () => {
    const plan = planReconciliation([held()], NOW);
    expect(plan.positions).toEqual([
      {
        instrumentId: "instrument-nvda",
        shares: ZERO,
        sharesWithBasisUsd: ZERO,
        costBasisUsd: ZERO,
        avgUnitCostUsd: ZERO,
      },
    ]);
  });
});
