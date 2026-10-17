import { describe, expect, it } from "vitest";
import {
  borrowChoices,
  borrowFromWire,
  ceilCents,
  floorCents,
  interestText,
  monthlyInterestText,
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
  setupCostUsd: null,
  owedUsdc: 0,
  principalUsdc: null,
  interestUsdc: null,
  closeLoanUsdc: 0,
  minPositionUsd: 0.01,
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

  it("never asks for more than the limit when it is not a whole cent", () => {
    /* A cap of $0.5098 asked for $0.51 and the server refused the extra penny. */
    const b = position({ borrowableNowUsd: 0.5098 });
    const plan = planBorrow(b, "borrow", b.collateral[0], 0.5098);
    expect(plan.intent).toEqual({ kind: "borrow", usd: "0.50" });
    /* Whatever the limit is, every borrow preset must be an amount that can be sent. */
    for (const preset of plan.presets) expect(preset.v).toBe(floorCents(preset.v));
  });

  it("refuses past the safety target", () => {
    const b = position();
    expect(planBorrow(b, "borrow", b.collateral[0], 81).blocked).toMatch(/At most \$80\.00/);
  });

  it("says there is nothing to repay with no loan", () => {
    expect(planBorrow(position(), "repay", undefined, 5).blocked).toBe("There is no loan to repay.");
  });

  it("withdraws everything as 'all' once nothing is owed", () => {
    const pledged = row({ depositedTokens: 0.25, depositableTokens: 0 });
    const b = position({ collateral: [pledged] });
    const plan = planBorrow(b, "withdraw", pledged, 0.25);
    expect(plan.max).toBe(0.25);
    expect(plan.intent).toEqual({ kind: "withdraw", ticker: "NVDA", tokensRaw: "all" });
  });

  it("takes an odd pledge back in full, with no loan to repay", () => {
    /* Max rounded 0.0202355 up to 0.020236 and the sheet then asked for a repayment of a debt of zero. */
    const pledged = row({ depositedTokens: 0.0202355, depositableTokens: 0 });
    const b = position({ collateral: [pledged], debtUsd: 0 });
    const offered = planBorrow(b, "withdraw", pledged, 0).presets.find((p) => p.label === "Max")!.v;
    expect(offered).toBeLessThanOrEqual(pledged.depositedTokens);
    const plan = planBorrow(b, "withdraw", pledged, offered);
    expect(plan.blocked).toBeNull();
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

  /* What Mercury pays to open a first-time borrower's Kamino account, struck through on the sheet. */
  it("reads the setup cost, and keeps its absence as null", () => {
    const wire = (setupCostUsd: string | null | undefined) =>
      ({ setupCostUsd, obligation: null, collateral: [] }) as unknown as BorrowWire;
    expect(borrowFromWire(wire("2.97")).setupCostUsd).toBe(2.97);
    expect(borrowFromWire(wire(null)).setupCostUsd).toBeNull();
    // A server from before the field says nothing at all.
    expect(borrowFromWire(wire(undefined)).setupCostUsd).toBeNull();
  });
});

/**
 * A loan as it stands a few minutes in: 2.110008 USDC owed, valued by Kamino at
 * $2.10974, and 2.110023 to hold to close it — what is owed and an hour of
 * interest. The borrower who found this held exactly the $2.11 they borrowed.
 */
const loan = (over: Partial<Borrow> = {}) =>
  position({
    debtUsd: 2.10974,
    owedUsdc: 2.110008,
    principalUsdc: 2.11,
    interestUsdc: 0.000008,
    closeLoanUsdc: 2.110023,
    cashUsd: 2.11,
    collateral: [row({ depositedTokens: 0.0224, depositableTokens: 0 })],
    ...over,
  });

describe("repaying", () => {
  it("offers All as what is owed, interest included, up to the cent", () => {
    const plan = planBorrow(loan(), "repay", undefined, 0);
    expect(plan.presets.find((p) => p.label === "All")?.v).toBe(2.12);
    expect(plan.max).toBe(2.12);
  });

  /*
   * What is owed, not what the wallet must hold to close it: the two differ by
   * an hour of interest, which only the cash check needs. "All" has to agree
   * with the rows it sits over — borrowed, interest, and their total.
   */
  it("offers All as the total of what was borrowed and the interest, not the headroom on top", () => {
    const b = loan({ owedUsdc: 1988.468616, debtUsd: 1988.23, closeLoanUsdc: 1988.481737, cashUsd: 5000 });
    expect(planBorrow(b, "repay", undefined, 0).presets.find((p) => p.label === "All")?.v).toBe(1988.47);
    expect(planBorrow(b, "repay", undefined, 1988.47).intent).toEqual({ kind: "repay", usd: "all" });
  });

  it("closes the loan when the amount reaches what is owed and the cash covers it", () => {
    const plan = planBorrow(loan({ cashUsd: 5 }), "repay", undefined, 2.12);
    expect(plan.intent).toEqual({ kind: "repay", usd: "all" });
    expect(plan.blocked).toBeNull();
  });

  /* What Kamino refused on 17 October: $2.11 against $2.110008 owed leaves $0.000008, under its one-cent minimum. */
  it("never sends a repay that would leave less than a cent owing", () => {
    const plan = planBorrow(loan({ cashUsd: 5 }), "repay", undefined, 2.11);
    expect(plan.intent).toEqual({ kind: "repay", usd: "all" });
  });

  it("says what closing the loan takes when the cash falls short of it", () => {
    const plan = planBorrow(loan(), "repay", undefined, 2.11);
    expect(plan.blocked).toBe(
      "Repaying all of it needs $2.12 in the wallet. You have $2.11: add $0.01 of USDC, or repay up to $2.10.",
    );
  });

  it("repays part of the loan when at least a cent is left owing", () => {
    const plan = planBorrow(loan(), "repay", undefined, 2.1);
    expect(plan.intent).toEqual({ kind: "repay", usd: "2.10" });
    expect(plan.blocked).toBeNull();
  });

  /* In USDC, as "to repay in full" says it, not at Kamino's dollar value of the debt. */
  it("says what will be owed after, in USDC", () => {
    expect(planBorrow(loan({ cashUsd: 5 }), "repay", undefined, 2.12).preview?.owed).toBe(0);
    expect(planBorrow(loan(), "repay", undefined, 2.1).preview?.owed).toBeCloseTo(0.010008, 9);
    const b = loan({ borrowableNowUsd: 50 });
    expect(planBorrow(b, "borrow", b.collateral[0], 10).preview?.owed).toBeCloseTo(12.110008, 9);
  });

  it("refuses to repay part with more cash than the wallet holds", () => {
    const plan = planBorrow(
      loan({ owedUsdc: 100, debtUsd: 99.99, closeLoanUsdc: 100.001, cashUsd: 10 }),
      "repay",
      undefined,
      20,
    );
    expect(plan.blocked).toBe("Only $10.00 of cash in the wallet.");
  });
});

describe("Kamino's one-cent minimum", () => {
  /* One NVDAx at $200 pledged and nothing owed: taking back 0.99999 leaves $0.002 of it. */
  it("will not take back all but a sliver of a pledge", () => {
    const b = position({ collateral: [row({ depositedTokens: 1, depositableTokens: 0 })] });
    expect(planBorrow(b, "withdraw", b.collateral[0], 0.99999).blocked).toBe(
      "That would leave less than $0.01 of NVDAx pledged, which Kamino does not allow. Take all of it back, or leave more.",
    );
  });

  it("will not pledge less than a cent of a stock", () => {
    const b = position();
    expect(planBorrow(b, "pledge", b.collateral[0], 0.00001).blocked).toBe(
      "Add at least $0.01 of NVDAx as collateral: Kamino does not take less.",
    );
  });

  it("will not lend less than a cent", () => {
    const b = position({ borrowableNowUsd: 80 });
    expect(planBorrow(b, "borrow", b.collateral[0], 0.005).blocked).toBe(
      "Borrow at least $0.01: Kamino does not lend less.",
    );
  });
});

describe("ceilCents", () => {
  it("rounds up to the cent, and leaves a whole cent alone", () => {
    expect(ceilCents(2.110023)).toBe(2.12);
    expect(ceilCents(2.12)).toBe(2.12);
  });
});

describe("borrowFromWire, what a loan is made of", () => {
  it("reads what is owed, what was lent, the interest and what closing takes", () => {
    const b = borrowFromWire({
      debtUsd: "2.11",
      owedUsdc: "2.110008",
      principalUsdc: "2.11",
      interestUsdc: "0.000008",
      closeLoanUsdc: "2.110023",
      minPositionUsd: "0.01",
      collateral: [],
    } as unknown as BorrowWire);
    expect(b).toMatchObject({
      owedUsdc: 2.110008,
      principalUsdc: 2.11,
      interestUsdc: 0.000008,
      closeLoanUsdc: 2.110023,
      minPositionUsd: 0.01,
    });
  });

  /* A server from before these fields: the debt stands in for what is owed, with the old 0.1% of headroom. */
  it("falls back on the debt from a server that does not say", () => {
    const b = borrowFromWire({ debtUsd: "20", collateral: [] } as unknown as BorrowWire);
    expect(b.owedUsdc).toBe(20);
    expect(b.closeLoanUsdc).toBeCloseTo(20.02, 6);
    expect(b.minPositionUsd).toBe(0.01);
    expect(b.principalUsdc).toBeNull();
    expect(b.interestUsdc).toBeNull();
  });
});

describe("interestText", () => {
  /* Minutes into a $2.11 loan the interest is $0.000008, and "$0.00" would say there is none. */
  it("says a fraction of a cent as less than a cent", () => {
    expect(interestText(0.000008)).toBe("Less than 1¢");
  });

  it("says a cent or more in dollars", () => {
    expect(interestText(0.03)).toBe("$0.03");
    expect(interestText(0)).toBe("$0.00");
  });

  it("says nothing when the ledger cannot tell", () => {
    expect(interestText(null)).toBe("—");
  });
});

describe("monthlyInterestText", () => {
  it("says roughly what a month of interest comes to on what is owed", () => {
    expect(monthlyInterestText(position({ owedUsdc: 1000, borrowApy: 0.077 }))).toBe("about $6.42 a month");
    expect(monthlyInterestText(position({ owedUsdc: 2.11, borrowApy: 0.077 }))).toBe("about $0.01 a month");
  });

  it("says less than a cent when that is what a month comes to", () => {
    expect(monthlyInterestText(position({ owedUsdc: 0.5, borrowApy: 0.077 }))).toBe("under 1¢ a month");
  });
});
