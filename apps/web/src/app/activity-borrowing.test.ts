import { describe, expect, it } from "vitest";
import { GROUPS, KIND_LABEL, type EventKind } from "./activity-data";
import { toEvent } from "./activity-map";
import type { ActivityItem } from "../api/hooks";

const row = (over: Partial<ActivityItem> = {}): ActivityItem =>
  ({
    kind: "borrow",
    occurredAt: "2026-09-30T12:00:00.000Z",
    title: "Borrowed $500.00 against SPYx",
    subtitle: null,
    amountUsd: "500",
    txSignature: "SIG",
    mint: null,
    logoUrl: null,
    ...over,
  }) as ActivityItem;

/**
 * Borrowing in the feed.
 *
 * Before this, a loan reached the browser as a `transfer_in` the wallet watcher
 * inferred from a balance, titled "Added cash" — the same row a deposit writes.
 * A pledge-and-borrow reached it as nothing at all.
 */
describe("a loan in the feed", () => {
  it("carries the server's own words, which name the collateral", () => {
    expect(toEvent(row()).title).toBe("Borrowed $500.00 against SPYx");
  });

  it("signs a loan as money in and a repayment as money out", () => {
    expect(toEvent(row()).flow).toBe("in");
    expect(toEvent(row({ kind: "repay", title: "Repaid $500.00" })).flow).toBe("out");
  });

  /*
   * Pledging moves stock, not money. A sign on it would say dollars left the
   * account, and none did — the shares are still the holder's and still counted
   * in the portfolio, they are just held by Kamino.
   */
  it("gives collateral no direction, because no money moved", () => {
    expect(toEvent(row({ kind: "pledge", title: "Pledged 2.4 SPYx", amountUsd: null })).flow).toBeNull();
    expect(toEvent(row({ kind: "unpledge", title: "Withdrew 2.4 SPYx", amountUsd: null })).flow).toBeNull();
  });

  it("files everything about the loan under one chip, warnings included", () => {
    const borrowing = GROUPS.find((g) => g.key === "borrowing");
    expect(borrowing?.kinds).toEqual(["borrow", "repay", "pledge", "unpledge", "loan_alert"]);
  });

  it("keeps them out of Trades, which is about buying and selling", () => {
    const trades = GROUPS.find((g) => g.key === "trades");
    expect(trades?.kinds).not.toContain("borrow");
  });

  it("has a label for every kind it can render", () => {
    for (const kind of ["borrow", "repay", "pledge", "unpledge"] as EventKind[]) {
      expect(KIND_LABEL[kind]).toBeTruthy();
    }
  });

  it("does not fall back to receive for a kind it knows", () => {
    // The map's default is "receive"; a kind that reached it unmapped would be
    // silently retitled as an incoming transfer.
    for (const kind of ["borrow", "repay", "pledge", "unpledge"]) {
      expect(toEvent(row({ kind, amountUsd: null })).kind).toBe(kind);
    }
  });
});
