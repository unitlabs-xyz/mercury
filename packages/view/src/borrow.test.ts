import { describe, expect, it } from "vitest";
import {
  borrowChoices,
  borrowFromWire,
  pickRow,
  planBorrow,
  type Borrow,
  type BorrowRow,
  type BorrowWire,
} from "./borrow.js";

const row = (over: Partial<BorrowRow> = {}): BorrowRow => ({
  ticker: "NVDA",
  isStock: true,
  decimals: 8,
  ltv: 0.5,
  liquidationThreshold: 0.6,
  pricePerToken: 200,
  depositedTokens: 0,
  depositedUsd: 0,
  depositableTokens: 1,
  depositableUsd: 200,
  safeLimitUsd: 80,
  borrowableUsd: 80,
  cushionAtTarget: 0.3,
  liquidationPrice: null,
  liquidationDistance: null,
  ...over,
});

const position = (over: Partial<Borrow> = {}): Borrow => ({
  safetyTarget: 0.8,
  cashUsd: 50,
  collateralUsd: 0,
  debtUsd: 0,
  borrowableNowUsd: 0,
  overTargetUsd: 0,
  health: "healthy",
  locked: false,
  usage: null,
  repayToClearMarginCallUsd: 0,
  dropToMarginCall: null,
  borrowableUsd: 80,
  spendableUsd: 130,
  ltv: 0,
  liquidationLtv: null,
  safeUntilDrop: null,
  poolAvailableUsd: 1_000_000,
  borrowApy: 0.08,
  obligation: null,
  collateral: [row()],
  ...over,
});

describe("planBorrow", () => {
  it("pledges just enough stock, with a cushion, when nothing is pledged yet", () => {
    const b = position();
    const plan = planBorrow(b, "borrow", b.collateral[0], 40);
    // 1 token × $200 × 0.5 LTV × 0.8 target = $80 at most.
    expect(plan.max).toBe(80);
    expect(plan.intent).toEqual({
      kind: "deposit_and_borrow",
      ticker: "NVDA",
      // $40 / $80 per token = 0.5, × 1.005 cushion, rounded up in base units.
      tokensRaw: "50250000",
      usd: "40.00",
    });
    expect(plan.blocked).toBeNull();
  });

  it("borrows without pledging when what is pledged already covers it", () => {
    const b = position({ borrowableNowUsd: 100 });
    expect(planBorrow(b, "borrow", b.collateral[0], 40).intent).toEqual({ kind: "borrow", usd: "40.00" });
  });

  it("refuses past the safety target", () => {
    const b = position();
    expect(planBorrow(b, "borrow", b.collateral[0], 81).blocked).toMatch(/At most \$80\.00/);
  });

  it("repays all only when the cash comfortably covers the debt", () => {
    expect(planBorrow(position({ debtUsd: 20, cashUsd: 50 }), "repay", undefined, 20).intent).toEqual({
      kind: "repay",
      usd: "all",
    });
    expect(planBorrow(position({ debtUsd: 20, cashUsd: 20 }), "repay", undefined, 20).intent).toEqual({
      kind: "repay",
      usd: "20.00",
    });
    expect(planBorrow(position({ debtUsd: 0 }), "repay", undefined, 5).blocked).toBe(
      "There is no loan to repay.",
    );
  });

  it("withdraws everything as 'all' once nothing is owed", () => {
    const pledged = row({ depositedTokens: 0.25, depositableTokens: 0 });
    const b = position({ collateral: [pledged] });
    const plan = planBorrow(b, "withdraw", pledged, 0.25);
    expect(plan.max).toBe(0.25);
    expect(plan.intent).toEqual({ kind: "withdraw", ticker: "NVDA", tokensRaw: "all" });
  });

  it("holds back the collateral a loan still needs", () => {
    const pledged = row({ depositedTokens: 1, depositableTokens: 0 });
    // $80 safe against it, $40 owed: $40 spare, $80 a token, less the cushion.
    const b = position({ debtUsd: 40, collateral: [pledged] });
    const plan = planBorrow(b, "withdraw", pledged, 0.9);
    expect(plan.max).toBeCloseTo(0.5 / 1.005, 6);
    expect(plan.blocked).toBe("Repay some of the loan first to take that much back.");
  });

  it("pauses borrowing and withdrawing on a locked loan, not repaying", () => {
    const b = position({ locked: true });
    expect(planBorrow(b, "borrow", b.collateral[0], 1).paused).toBe(true);
    expect(planBorrow(b, "withdraw", b.collateral[0], 1).paused).toBe(true);
    expect(planBorrow(b, "repay", undefined, 1).paused).toBe(false);
  });
});

describe("choosing a stock", () => {
  it("offers only what each tab can act on, and leads with the most borrowable", () => {
    const free = row({ ticker: "AAPL", borrowableUsd: 10 });
    const held = row({ ticker: "NVDA", depositedTokens: 1, depositableTokens: 0, borrowableUsd: 50 });
    const b = position({ collateral: [free, held, row({ ticker: "USDC", isStock: false })] });
    expect(borrowChoices(b, "pledge").map((r) => r.ticker)).toEqual(["AAPL"]);
    expect(borrowChoices(b, "withdraw").map((r) => r.ticker)).toEqual(["NVDA"]);
    expect(pickRow(borrowChoices(b, "borrow"), null)?.ticker).toBe("NVDA");
    expect(pickRow(borrowChoices(b, "borrow"), "AAPL")?.ticker).toBe("AAPL");
  });
});

describe("borrowFromWire", () => {
  it("reads strings as numbers and keeps nulls", () => {
    const b = borrowFromWire({
      safetyTarget: "0.8",
      debtUsd: "12.5",
      locked: false,
      health: "healthy",
      usage: null,
      obligation: "abc",
      collateral: [{ ticker: "NVDA", isStock: true, decimals: 8, liquidationPrice: null }],
    } as unknown as BorrowWire);
    expect(b.debtUsd).toBe(12.5);
    expect(b.usage).toBeNull();
    expect(b.locked).toBe(false);
    expect(b.obligation).toBe("abc");
    expect(b.collateral[0]?.liquidationPrice).toBeNull();
  });
});
