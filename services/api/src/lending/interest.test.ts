import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { closeLoanUsdc, leavesDust, loanParts, outstandingPrincipal, type LedgerRow } from "./interest.js";

const row = (kind: string, usdAmount: string | null, debtAfterUsd: string): LedgerRow => ({
  kind,
  usdAmount: usdAmount === null ? null : D(usdAmount),
  debtAfterUsd: D(debtAfterUsd),
});

describe("outstandingPrincipal", () => {
  it("is what was borrowed", () => {
    expect(outstandingPrincipal([row("pledge", null, "0"), row("borrow", "2.11", "2.11")])?.toString()).toBe(
      "2.11",
    );
  });

  it("comes down by what is repaid", () => {
    const rows = [row("borrow", "100", "100"), row("repay", "40", "60.02")];
    expect(outstandingPrincipal(rows)?.toString()).toBe("60");
  });

  /* A repay of everything records no figure; it closes the loan, and that is all it needs to say. */
  it("is nothing after a repay of everything", () => {
    const rows = [row("borrow", "100", "100"), row("repay", null, "0")];
    expect(outstandingPrincipal(rows)?.toString()).toBe("0");
  });

  /* Repaying the interest too would otherwise leave a principal below zero. */
  it("never goes below nothing", () => {
    const rows = [row("borrow", "100", "100"), row("repay", "100.5", "0")];
    expect(outstandingPrincipal(rows)?.toString()).toBe("0");
  });

  it("starts again when a closed loan is followed by a new one", () => {
    const rows = [row("borrow", "10", "10"), row("repay", null, "0"), row("borrow", "5", "5")];
    expect(outstandingPrincipal(rows)?.toString()).toBe("5");
  });

  it("is nothing whenever Kamino reported the loan closed", () => {
    const rows = [row("borrow", "10", "10"), row("repay", "9.99", "0")];
    expect(outstandingPrincipal(rows)?.toString()).toBe("0");
  });

  it("leaves collateral moves out of it", () => {
    const rows = [row("borrow", "10", "10"), row("pledge", null, "10"), row("unpledge", null, "10")];
    expect(outstandingPrincipal(rows)?.toString()).toBe("10");
  });

  /* With no borrow on record, any debt is one the ledger cannot explain, and saying "no interest" would be a guess. */
  it("says nothing when no borrow was ever recorded", () => {
    expect(outstandingPrincipal([row("pledge", null, "0")])).toBeNull();
    expect(outstandingPrincipal([])).toBeNull();
  });
});

describe("loanParts", () => {
  it("splits what is owed into what was borrowed and the interest on it", () => {
    const parts = loanParts(D("2.110008"), D("2.11"));
    expect(parts.principal?.toString()).toBe("2.11");
    expect(parts.interest?.toString()).toBe("0.000008");
  });

  /* A repay the ledger missed would otherwise show a principal bigger than the whole debt. */
  it("never puts more principal than is owed", () => {
    const parts = loanParts(D("50"), D("60"));
    expect(parts.principal?.toString()).toBe("50");
    expect(parts.interest?.toString()).toBe("0");
  });

  it("says nothing when the ledger cannot explain the debt", () => {
    expect(loanParts(D("10"), null)).toEqual({ principal: null, interest: null });
  });
});

describe("closeLoanUsdc", () => {
  /*
   * Owed, plus an hour of interest at today's rate, rounded up to the
   * micro-USDC: the interest that can accrue between reading the debt and the
   * repay landing. Kamino takes only what is owed; the rest stays in the wallet.
   */
  it("covers an hour of interest on top of what is owed", () => {
    // 2.110008 × (1 + 0.077 / 8,760) = 2.1100265…, up to 2.110027.
    expect(closeLoanUsdc(D("2.110008"), D("0.077")).toString()).toBe("2.110027");
  });

  /* The 0.1% this replaces asked a $1,000 borrower for $1,001; a day of interest is $0.21. */
  it("asks a large loan for cents, not dollars, of headroom", () => {
    expect(closeLoanUsdc(D("1000"), D("0.077")).toString()).toBe("1000.00879");
  });

  it("is nothing when nothing is owed", () => {
    expect(closeLoanUsdc(D("0"), D("0.077")).toString()).toBe("0");
  });
});

describe("leavesDust", () => {
  /* Kamino's rule, after every borrow, repay, pledge and withdrawal: a position is worth nothing, or at least the minimum. */
  it("is a position worth more than nothing and less than the minimum", () => {
    expect(leavesDust(D("0.000008"), D("0.01"))).toBe(true);
    expect(leavesDust(D("0.009999"), D("0.01"))).toBe(true);
  });

  it("is not a position worth nothing, or worth the minimum", () => {
    expect(leavesDust(D("0"), D("0.01"))).toBe(false);
    expect(leavesDust(D("0.01"), D("0.01"))).toBe(false);
    expect(leavesDust(D("-1"), D("0.01"))).toBe(false);
  });
});
