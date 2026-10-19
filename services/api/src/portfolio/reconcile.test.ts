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
  // Filled at the quote and free, unless a test says otherwise. A reference of
  // zero against a recorded cost would mean the whole cost was premium, which
  // is not what most of these tests are about.
  recordedReferenceUsd: over.recordedCostUsd ?? ZERO,
  recordedFeeUsd: ZERO,
  settling: false,
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
        referenceBasisUsd: ZERO,
        feeUsd: ZERO,
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

  it("does not trim significant zeros from a whole-number share count", () => {
    // A multiplier that hands over exactly 100 whole shares must read "100
    // shares", not "1 shares" — the failure mode of a trim that strips
    // trailing zeros without checking for a decimal point first.
    const plan = planReconciliation([withLot({ multiplier: D(101) })], NOW);
    expect(plan.activity[0]!.subtitle).toBe("Paid as 100 shares");
    expect(plan.activity[0]!.title).toMatch(/^[A-Z]+ dividend$/);
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

  /*
   * The loop that reached production. `apply` stores shares through
   * `toFixed(18)` and reads the multiplier fresh from the mint, so the
   * recorded multiplier is a rounded quotient chasing an unrounded one. With a
   * holding that does not divide evenly it missed by the last few bits every
   * time, and wrote a "paid a dividend" row every two seconds, each adding
   * nothing.
   *
   * This runs the real feedback path: plan, round the way the database does,
   * feed it back. The second pass must be silent.
   */
  it("settles after one pass even when the shares do not divide evenly", () => {
    // 0.006778 tokens, as a real $5 buy of META produced.
    const raw = 678n;
    const decimals = 5;
    const multiplier = D("1.000000000000000007");

    const first = planReconciliation(
      [
        held({
          chainRawAmount: raw,
          recordedRawAmount: raw,
          decimals,
          multiplier,
          recordedShares: D("0.00678"),
        }),
      ],
      NOW,
    );
    const gained = first.lots.reduce((t, l) => t.add(l.shares), D(0));

    // Stored the way apply.ts stores it, and read back.
    const stored = D(D("0.00678").add(gained).toFixed(18));
    const second = planReconciliation(
      [held({ chainRawAmount: raw, recordedRawAmount: raw, decimals, multiplier, recordedShares: stored })],
      NOW,
    );
    expect(second.lots).toEqual([]);
    expect(second.activity).toEqual([]);
  });

  /* A row saying "0 shares added, at no cost" is not a dividend. */
  it("never writes a dividend that adds nothing", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: 678n,
          recordedRawAmount: 678n,
          decimals: 5,
          multiplier: D("1.0000000000000000001"),
          recordedShares: D("0.00678"),
        }),
      ],
      NOW,
    );
    expect(plan.activity).toEqual([]);
  });

  it("writes nothing at all when nothing moved", () => {
    const plan = planReconciliation([withLot()], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
  });
});

describe("planReconciliation: tokens that left", () => {
  it("follows the chain down, and records the tokens that left", () => {
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
    expect(plan.disposals).toEqual([
      {
        tokenId: "token-nvdax",
        instrumentId: "instrument-nvda",
        tokenQty: ONE_TOKEN / 2n,
        shares: D("0.5"),
        kind: "transfer_out",
        occurredAt: NOW,
      },
    ]);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: D("0.5"),
      sharesWithBasisUsd: D("0.5"),
      costBasisUsd: D(100),
      referenceBasisUsd: D(100),
      feeUsd: ZERO,
      // Average cost does not move when a position shrinks. That is what
      // average-cost accounting means, and it is why the scaling is pro rata.
      avgUnitCostUsd: D(200),
    });
  });

  it("scales the reference and the fees by the same ratio as the cost", () => {
    // Half the position left. If the cost were capped and the reference were
    // not, the shares that went would read as a market move, and the two lines
    // of a stacked return would stop summing to the dollars.
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN / 2n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
          recordedReferenceUsd: D("198.00"),
          recordedFeeUsd: D("0.46"),
        }),
      ],
      NOW,
    );
    expect(plan.positions[0]).toMatchObject({
      costBasisUsd: D(100),
      referenceBasisUsd: D(99),
      feeUsd: D("0.23"),
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
    expect(plan.disposals.map((d) => d.tokenQty)).toEqual([ONE_TOKEN]);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: ZERO,
      sharesWithBasisUsd: ZERO,
      costBasisUsd: ZERO,
      referenceBasisUsd: ZERO,
      feeUsd: ZERO,
      avgUnitCostUsd: ZERO,
    });
  });

  it("records nothing on the pass after, once the records have caught up", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN / 2n,
          recordedRawAmount: ONE_TOKEN / 2n,
          recordedShares: D("0.5"),
          recordedCostUsd: D(100),
        }),
      ],
      NOW,
    );
    expect(plan.disposals).toEqual([]);
  });

  it("records nothing for tokens that arrived, which have no cost to take away", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.disposals).toEqual([]);
  });

  it("credits a dividend only on the tokens still held", () => {
    // Half the tokens left, then the multiplier rose by half. The dividend is
    // half a share on the half token still here, not on the token that went.
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN / 2n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
          multiplier: D("1.5"),
        }),
      ],
      NOW,
    );
    expect(plan.lots.map((l) => l.shares)).toEqual([D("0.25")]);
    expect(plan.positions[0]).toMatchObject({ shares: D("0.75"), costBasisUsd: D(100) });
  });
});

describe("planReconciliation: a sell in flight", () => {
  /*
   * The pass reads the finalized balance, and a sell settles against the
   * confirmed one, so for a few seconds the two disagree about a sell that is
   * fine. Reading that as a transfer would remove the shares twice.
   */
  it("leaves the stock as it was for the pass", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN / 2n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
          settling: true,
        }),
      ],
      NOW,
    );
    expect(plan).toEqual({ lots: [], activity: [], disposals: [], positions: [] });
  });

  it("leaves every wrapper of that stock as it was", () => {
    const backed = held({
      chainRawAmount: 0n,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      settling: true,
    });
    const ondo = held({ tokenId: "token-nvdaon", mint: "OnDo", decimals: 6, chainRawAmount: 2_000_000n });
    expect(planReconciliation([backed, ondo], NOW).positions).toEqual([]);
  });

  it("goes on reconciling other stocks", () => {
    const nvda = held({
      chainRawAmount: 0n,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      settling: true,
    });
    const spy = held({
      tokenId: "token-spyx",
      instrumentId: "instrument-spy",
      ticker: "SPY",
      chainRawAmount: ONE_TOKEN,
    });
    expect(planReconciliation([nvda, spy], NOW).positions.map((p) => p.instrumentId)).toEqual([
      "instrument-spy",
    ]);
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
      referenceBasisUsd: D(200),
      feeUsd: ZERO,
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
        referenceBasisUsd: ZERO,
        feeUsd: ZERO,
        avgUnitCostUsd: ZERO,
      },
    ]);
  });
});
