import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import {
  dividendsSince,
  dollarCost,
  multiplierAt,
  replayAccount,
  replayWithDepartures,
  type ArrivalCost,
  type CostMovement,
  type MultiplierStep,
} from "./cost-plan.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const exact = (unit: string): ArrivalCost => ({
  unitCostUsd: D(unit),
  referencePriceUsd: D(unit),
  estimateSource: null,
});
const one = D(1);
/** 8 decimals: a whole token is 100,000,000. */
const tokens = (n: number) => BigInt(Math.round(n * 1e8));
const inn = (n: number, at: Date, cost: ArrivalCost, multiplier = one): CostMovement => ({
  kind: "in",
  amountRaw: tokens(n),
  at,
  multiplier,
  cost,
});
const out = (n: number, at: Date): CostMovement => ({
  kind: "out",
  amountRaw: tokens(n),
  at,
  multiplier: one,
});

describe("dollarCost", () => {
  it("is the dollars that left over the shares that arrived, for USDC or USDT", () => {
    expect(dollarCost(USDC, 1_500_000_000n, D(5))?.toString()).toBe("300");
    expect(dollarCost(USDT, 50_000_000n, D("0.2"))?.toString()).toBe("250");
  });

  it("is not exact when something else paid, or nothing did, or no shares arrived", () => {
    expect(dollarCost("So11111111111111111111111111111111111111112", 1n, D(1))).toBeNull();
    expect(dollarCost(null, null, D(1))).toBeNull();
    expect(dollarCost(USDC, 1n, D(0))).toBeNull();
  });
});

describe("replayAccount", () => {
  it("keeps each arrival as its own lot at its own cost", () => {
    const lots = replayAccount([inn(2, day(1), exact("100")), inn(3, day(2), exact("200"))], 8);
    expect(lots.map((l) => [l.tokenQty, l.shares.toString(), l.unitCostUsd.toString()])).toEqual([
      [tokens(2), "2", "100"],
      [tokens(3), "3", "200"],
    ]);
  });

  it("takes a departure from every open lot in proportion, so the average cost does not move", () => {
    const lots = replayAccount(
      [inn(2, day(1), exact("100")), inn(2, day(2), exact("300")), out(2, day(3))],
      8,
    );
    expect(lots.map((l) => [l.tokenQty, l.unitCostUsd.toString()])).toEqual([
      [tokens(1), "100"],
      [tokens(1), "300"],
    ]);
    const shares = lots.reduce((s, l) => s.add(l.shares), D(0));
    const cost = lots.reduce((s, l) => s.add(l.shares.mul(l.unitCostUsd)), D(0));
    expect(cost.div(shares).toString()).toBe("200");
  });

  it("keeps the tokens exact when a departure does not divide evenly", () => {
    const lots = replayAccount(
      [
        { kind: "in", amountRaw: 1n, at: day(1), multiplier: one, cost: exact("1") },
        { kind: "in", amountRaw: 1n, at: day(2), multiplier: one, cost: exact("1") },
        { kind: "in", amountRaw: 1n, at: day(3), multiplier: one, cost: exact("1") },
        { kind: "out", amountRaw: 1n, at: day(4), multiplier: one },
      ],
      0,
    );
    expect(lots.reduce((s, l) => s + l.tokenQty, 0n)).toBe(2n);
  });

  it("leaves nothing once everything has gone, and starts again from the next arrival", () => {
    const lots = replayAccount([inn(5, day(1), exact("10")), out(5, day(2)), inn(1, day(3), exact("50"))], 8);
    expect(lots.map((l) => [l.tokenQty, l.unitCostUsd.toString(), l.acquiredAt])).toEqual([
      [tokens(1), "50", day(3)],
    ]);
  });

  it("takes nothing for a departure of tokens it never saw arrive", () => {
    expect(replayAccount([out(3, day(1)), inn(1, day(2), exact("7"))], 8)).toHaveLength(1);
  });

  it("counts shares at the multiplier each lot arrived at", () => {
    const [lot] = replayAccount([inn(2, day(1), exact("100"), D("1.05"))], 8);
    expect(lot!.shares.toString()).toBe("2.1");
  });

  it("prices what was held before the oldest movement read, when the walk stopped at its cap", () => {
    const opening = {
      amountRaw: tokens(4),
      at: day(1),
      multiplier: one,
      cost: { unitCostUsd: D("90"), referencePriceUsd: D("90"), estimateSource: "market_price" as const },
    };
    const lots = replayAccount([out(2, day(2))], 8, opening);
    expect(lots.map((l) => [l.tokenQty, l.estimateSource])).toEqual([[tokens(2), "market_price"]]);
  });

  it("refuses an arrival with no cost rather than writing a free lot", () => {
    expect(() => replayAccount([{ kind: "in", amountRaw: 1n, at: day(1), multiplier: one }], 0)).toThrow(
      "without a cost",
    );
  });
});

describe("multiplierAt", () => {
  const steps: MultiplierStep[] = [
    { at: day(10), from: D("1.00"), to: D("1.01") },
    { at: day(20), from: D("1.01"), to: D("1.02") },
  ];

  it("is the last step at or before the moment", () => {
    expect(multiplierAt(day(15), steps, D("1.03")).toString()).toBe("1.01");
    expect(multiplierAt(day(20), steps, D("1.03")).toString()).toBe("1.02");
  });

  it("is the earliest known before any step, and today's with none recorded", () => {
    expect(multiplierAt(day(1), steps, D("1.03")).toString()).toBe("1");
    expect(multiplierAt(day(1), [], D("1.03")).toString()).toBe("1.03");
  });
});

describe("dividendsSince", () => {
  it("credits each held lot the rises after it arrived, dated when each was seen", () => {
    const lots = replayAccount([inn(100, day(1), exact("10")), inn(100, day(15), exact("10"), D("1.01"))], 8);
    const paid = dividendsSince(
      lots,
      [
        { at: day(10), from: D("1"), to: D("1.01") },
        { at: day(20), from: D("1.01"), to: D("1.02") },
      ],
      8,
    );
    expect(paid.map((d) => [d.at, d.shares.toString()])).toEqual([
      [day(10), "1"],
      [day(20), "2"],
    ]);
  });

  it("pays nothing for a fall, a rise before arrival, or a rise too small to be one", () => {
    const lots = replayAccount([inn(1, day(15), exact("10"))], 8);
    expect(
      dividendsSince(
        lots,
        [
          { at: day(10), from: D("1"), to: D("1.5") },
          { at: day(20), from: D("1.5"), to: D("1.4") },
          { at: day(25), from: D("1.4"), to: D("1.4000000000001") },
        ],
        8,
      ),
    ).toEqual([]);
  });
});

describe("replayWithDepartures", () => {
  const tagged = (n: number, at: Date, ref: string): CostMovement => ({ ...out(n, at), ref });
  const estimated = (unit: string): ArrivalCost => ({
    unitCostUsd: D(unit),
    referencePriceUsd: D(unit),
    estimateSource: "market_price",
  });

  it("says what a tagged departure took: its share of every open lot, at average cost", () => {
    const { lots, departures } = replayWithDepartures(
      [inn(2, day(1), exact("100")), inn(2, day(2), exact("300")), tagged(2, day(3), "move")],
      8,
    );
    expect(departures).toHaveLength(1);
    const [d] = departures;
    expect([d!.ref, d!.tokenQty, d!.shares.toString(), d!.costUsd.toString(), d!.estimated]).toEqual([
      "move",
      tokens(2),
      "2",
      "400",
      false,
    ]);
    // What stays keeps its own cost: the same as replayAccount.
    expect(lots).toEqual(
      replayAccount([inn(2, day(1), exact("100")), inn(2, day(2), exact("300")), out(2, day(3))], 8),
    );
  });

  it("takes only what was read in: tokens beyond it left with no cost to carry", () => {
    const { departures } = replayWithDepartures([inn(1, day(1), exact("100")), tagged(3, day(2), "move")], 8);
    expect([departures[0]!.tokenQty, departures[0]!.costUsd.toString()]).toEqual([tokens(1), "100"]);
  });

  it("says a departure from nothing read took nothing", () => {
    const { departures } = replayWithDepartures([tagged(1, day(1), "move")], 8);
    expect([departures[0]!.tokenQty, departures[0]!.shares.toString()]).toEqual([0n, "0"]);
  });

  it("marks what it took estimated when any lot it took from was", () => {
    const { departures } = replayWithDepartures(
      [inn(1, day(1), exact("100")), inn(1, day(2), estimated("200")), tagged(1, day(3), "move")],
      8,
    );
    expect(departures[0]!.estimated).toBe(true);
    expect(departures[0]!.costUsd.toString()).toBe("150");
  });

  it("reports only tagged departures, and counts shares at each lot's own multiplier", () => {
    const { departures } = replayWithDepartures(
      [inn(1, day(1), exact("100"), D("1.1")), out(0.5, day(2)), tagged(0.5, day(3), "move")],
      8,
    );
    expect(departures.map((d) => [d.ref, d.tokenQty, d.shares.toString()])).toEqual([
      ["move", tokens(0.5), "0.55"],
    ]);
  });
});
