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

describe("planReconciliation: tokens we never sold", () => {
  it("writes an estimated transfer_in lot for a wallet that arrives holding something", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.lots).toEqual([
      {
        tokenId: "token-nvdax",
        instrumentId: "instrument-nvda",
        tokenQty: ONE_TOKEN,
        shares: D(1),
        unitCostUsd: D(200),
        source: "transfer_in",
        isEstimated: true,
        acquiredAt: NOW,
      },
    ]);
  });

  it("says in the activity feed that the cost is a guess", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.activity).toEqual([
      {
        kind: "transfer_in",
        title: "Received NVDAx",
        subtitle: "1 share, cost estimated at today's price",
        amountUsd: D(200),
        refTable: "token",
        refId: "token-nvdax",
        occurredAt: NOW,
      },
    ]);
  });

  it("counts shares at the multiplier in force, not at one", () => {
    const plan = planReconciliation(
      [held({ chainRawAmount: ONE_TOKEN, multiplier: D("1.001701196801074") })],
      NOW,
    );
    expect(plan.lots[0]!.shares.toFixed()).toBe("1.001701196801074");
  });

  it("writes nothing the second time, because nothing arrived", () => {
    const settled = held({
      chainRawAmount: ONE_TOKEN,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      recordedCostUsd: D(200),
    });
    const plan = planReconciliation([settled], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
    expect(plan.positions).toEqual([
      { instrumentId: "instrument-nvda", shares: D(1), costBasisUsd: D(200), avgUnitCostUsd: D(200) },
    ]);
  });

  it("records only what arrived since last time", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN * 3n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    expect(plan.lots.length).toBe(1);
    expect(plan.lots[0]!.tokenQty).toBe(ONE_TOKEN * 2n);
    expect(plan.lots[0]!.shares).toEqual(D(2));
  });
});

describe("planReconciliation: a dividend", () => {
  it("writes a zero-cost lot when the multiplier has risen", () => {
    const plan = planReconciliation(
      [
        held({
          multiplier: D("1.5"),
          chainRawAmount: ONE_TOKEN,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
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
    const plan = planReconciliation(
      [
        held({
          multiplier: D("1.5"),
          chainRawAmount: ONE_TOKEN,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    const position = plan.positions[0]!;
    expect(position.shares).toEqual(D("1.5"));
    // The same money. More shares. Nothing was spent.
    expect(position.costBasisUsd).toEqual(D(200));
    expect(position.avgUnitCostUsd.toFixed(4)).toBe("133.3333");
  });

  it("writes the dividend once", () => {
    const after = held({
      multiplier: D("1.5"),
      chainRawAmount: ONE_TOKEN,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D("1.5"),
      recordedCostUsd: D(200),
    });
    expect(planReconciliation([after], NOW).lots).toEqual([]);
  });

  it("does not bill a new arrival for a dividend it was never owed", () => {
    // The transfer_in lot is already recorded at the current multiplier, so the
    // shortfall it would otherwise leave behind is zero.
    const plan = planReconciliation(
      [held({ multiplier: D("1.5"), chainRawAmount: ONE_TOKEN })],
      NOW,
    );
    expect(plan.lots.length).toBe(1);
    expect(plan.lots[0]!.source).toBe("transfer_in");
    expect(plan.lots[0]!.shares).toEqual(D("1.5"));
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
      costBasisUsd: D(100),
      // Average cost does not move when a position shrinks. That is what
      // average-cost accounting means, and it is why the scaling is pro rata.
      avgUnitCostUsd: D(200),
    });
  });

  it("writes no activity for it, because we do not know what happened", () => {
    const plan = planReconciliation(
      [held({ chainRawAmount: 0n, recordedRawAmount: ONE_TOKEN, recordedShares: D(1), recordedCostUsd: D(200) })],
      NOW,
    );
    expect(plan.activity).toEqual([]);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: ZERO,
      costBasisUsd: ZERO,
      avgUnitCostUsd: ZERO,
    });
  });
});

describe("planReconciliation: what it refuses to do", () => {
  it("will not write a lot it cannot price", () => {
    const plan = planReconciliation(
      [held({ chainRawAmount: ONE_TOKEN, referencePricePerShare: null })],
      NOW,
    );
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
  });

  it("will not claim shares it has no cost for", () => {
    const plan = planReconciliation(
      [held({ chainRawAmount: ONE_TOKEN, referencePricePerShare: null })],
      NOW,
    );
    expect(plan.positions[0]!.shares).toEqual(ZERO);
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
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: D(3),
      costBasisUsd: D(600),
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
      referencePricePerShare: D(600),
    });
    const plan = planReconciliation([nvda, spy], NOW);
    expect(plan.positions.map((p) => p.instrumentId).sort()).toEqual(["instrument-nvda", "instrument-spy"]);
  });

  it("emits a zero position rather than no row, so a closed holding stops showing", () => {
    const plan = planReconciliation([held()], NOW);
    expect(plan.positions).toEqual([
      { instrumentId: "instrument-nvda", shares: ZERO, costBasisUsd: ZERO, avgUnitCostUsd: ZERO },
    ]);
  });
});
