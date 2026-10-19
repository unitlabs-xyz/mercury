import { describe, expect, it } from "vitest";
import { movementsByToken, type DisposalRow, type LotRow } from "./open.js";

const AT = new Date("2026-10-01T15:00:00Z");
/** Microseconds, as `loadHeldTokens` reads `recorded_at`. */
const AT_US = AT.getTime() * 1000;
const LATER_US = AT_US + 86_400_000_000;

const lot = (over: Partial<LotRow>): LotRow => ({
  id: "lot-a",
  tokenId: "token-nvdax",
  tokenQty: 100n,
  shares: "1",
  unitCostUsd: "200",
  referencePriceUsd: null,
  feeUsd: "0.5",
  acquiredAt: AT,
  recordedAtUs: AT_US,
  isEstimated: false,
  ...over,
});

const disposal = (over: Partial<DisposalRow>): DisposalRow => ({
  id: "disposal-a",
  tokenId: "token-nvdax",
  tokenQty: 100n,
  recordedAtUs: AT_US,
  ...over,
});

describe("movementsByToken", () => {
  it("orders by when each was recorded, not when a lot was acquired", () => {
    const moves = movementsByToken(
      [lot({ id: "imported", recordedAtUs: LATER_US, acquiredAt: new Date("2025-03-12T00:00:00Z") })],
      [disposal({ recordedAtUs: AT_US })],
    ).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["out", "in"]);
  });

  it("tells apart two rows recorded in the same millisecond", () => {
    const moves = movementsByToken(
      [lot({ recordedAtUs: AT_US + 1 })],
      [disposal({ recordedAtUs: AT_US })],
    ).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["out", "in"]);
  });

  it("puts a lot before a disposal recorded in the same instant", () => {
    const moves = movementsByToken([lot({})], [disposal({})]).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["in", "out"]);
  });

  it("puts a dividend lot after a disposal recorded in the same instant", () => {
    // A pass writes its transfer out and its dividend in one transaction, so
    // they share a timestamp. The dividend was worked out on the tokens left
    // after the transfer, so it has to replay after it.
    const moves = movementsByToken([lot({ tokenQty: 0n })], [disposal({})]).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["out", "in"]);
  });

  it("still puts a lot with tokens ahead of a dividend and a disposal recorded in the same instant", () => {
    const moves = movementsByToken(
      [lot({ id: "dividend", tokenQty: 0n, shares: "0.25" }), lot({ id: "buy" })],
      [disposal({})],
    ).get("token-nvdax")!;
    expect(moves.map((m) => (m.kind === "in" ? `in:${m.tokenQty}` : "out"))).toEqual([
      "in:100",
      "out",
      "in:0",
    ]);
  });

  it("keeps tokens apart", () => {
    const byToken = movementsByToken([lot({}), lot({ id: "lot-b", tokenId: "token-spyx" })], []);
    expect([...byToken.keys()].sort()).toEqual(["token-nvdax", "token-spyx"]);
  });

  it("prices a lot as the reconcile always has", () => {
    // Shares x unit cost, and the reference falls back to the unit cost when
    // none was recorded, which reads as no premium paid.
    const [move] = movementsByToken([lot({ shares: "2" })], []).get("token-nvdax")!;
    expect(move).toMatchObject({ kind: "in", tokenQty: 100n, isEstimated: false });
    if (move?.kind !== "in") throw new Error("expected a lot");
    expect(move.costUsd.toFixed(2)).toBe("400.00");
    expect(move.referenceUsd.toFixed(2)).toBe("400.00");
    expect(move.feeUsd.toFixed(2)).toBe("0.50");
  });
});
