import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { planLoanEvents, tokenText } from "./events.js";

const decimalsOf = () => 8;

describe("tokenText", () => {
  it("writes a token quantity the way a person would", () => {
    expect(tokenText("240000000", 8)).toBe("2.4");
    expect(tokenText("100000000", 8)).toBe("1");
    expect(tokenText("1", 8)).toBe("0.00000001");
  });

  it("does not eat a whole number's zeros", () => {
    // The bug `plural()` had in reconcile.ts: "100" became "1".
    expect(tokenText("10000000000", 8)).toBe("100");
  });
});

describe("planLoanEvents", () => {
  it("names the collateral when the pledge is in the same transaction", () => {
    const events = planLoanEvents(
      { kind: "deposit_and_borrow", ticker: "SPACEX", tokensRaw: "240000000", usd: D("500") },
      decimalsOf,
    );
    expect(events.map((e) => e.kind)).toEqual(["pledge", "borrow"]);
    expect(events[1]!.title).toBe("Borrowed $500.00 against SPACEX");
    expect(events[0]!.title).toBe("Pledged 2.4 SPACEX");
  });

  /*
   * One transaction, two events. A feed with only the cash loses the pledge; a
   * feed with only the pledge loses the loan.
   */
  it("splits one transaction into both the things it did", () => {
    const events = planLoanEvents(
      { kind: "deposit_and_borrow", ticker: "SPACEX", tokensRaw: "240000000", usd: D("500") },
      decimalsOf,
    );
    expect(events).toHaveLength(2);
  });

  it("names no ticker when the loan draws on everything already pledged", () => {
    const [event] = planLoanEvents({ kind: "borrow", usd: D("500") }, decimalsOf);
    expect(event!.title).toBe("Borrowed $500.00");
    expect(event!.ticker).toBeNull();
    expect(event!.subtitle).toBe("Against your pledged stock");
  });

  it("carries the figure on a repay of a stated amount", () => {
    const [event] = planLoanEvents({ kind: "repay", usd: D("250.5") }, decimalsOf);
    expect(event!.title).toBe("Repaid $250.50");
    expect(event!.usdAmount?.toFixed(2)).toBe("250.50");
  });

  /*
   * The size of "everything" is decided by the chain when it lands, and differs
   * from anything we could state here by the interest accrued in between. A
   * number that is nearly right is worse in a feed than no number.
   */
  it("states no figure for repaying everything, because we do not know it yet", () => {
    const [event] = planLoanEvents({ kind: "repay", usd: "all" }, decimalsOf);
    expect(event!.title).toBe("Repaid your loan in full");
    expect(event!.usdAmount).toBeNull();
  });

  it("does the same for withdrawing everything", () => {
    const [event] = planLoanEvents({ kind: "withdraw", ticker: "SPACEX", tokensRaw: "all" }, decimalsOf);
    expect(event!.title).toBe("Withdrew all your SPACEX");
    expect(event!.tokensRaw).toBeNull();
  });

  it("reports a pledge on its own as collateral moving, not as money", () => {
    const [event] = planLoanEvents({ kind: "deposit", ticker: "SPACEX", tokensRaw: "240000000" }, decimalsOf);
    expect(event!.kind).toBe("pledge");
    expect(event!.usdAmount).toBeNull();
    expect(event!.subtitle).toBe("Held by Kamino as collateral");
  });

  it("reports a withdrawal of a stated size with that size", () => {
    const [event] = planLoanEvents(
      { kind: "withdraw", ticker: "SPACEX", tokensRaw: "240000000" },
      decimalsOf,
    );
    expect(event!.title).toBe("Withdrew 2.4 SPACEX");
  });
});
