import { describe, expect, it } from "vitest";
import type { BorrowSummary, Health } from "./capacity.js";
import { alertFor, markAfter } from "./watch.js";

type Input = Parameters<typeof alertFor>[1];

const at = (health: Health, over: Partial<Input> = {}): Input =>
  ({
    health,
    debtUsd: 2500,
    repayToClearMarginCallUsd: 340,
    overTargetUsd: 180,
    safeUntilDrop: 0.12,
    ...over,
  }) as unknown as BorrowSummary;

/**
 * When a loan is worth interrupting somebody for.
 *
 * This is the whole job. The maths in capacity.ts already knows the loan is in
 * trouble; what this decides is whether saying so again is help or noise.
 */
describe("alertFor", () => {
  it("says nothing about a healthy loan", () => {
    expect(alertFor(null, at("healthy"))).toBeNull();
    expect(alertFor("margin_call", at("healthy"))).toBeNull();
  });

  it("speaks the first time a loan goes past its limit", () => {
    const alert = alertFor(null, at("over_limit"));
    expect(alert?.health).toBe("over_limit");
    expect(alert?.body).toContain("$180.00");
    // Nothing is being sold yet, and saying otherwise would be a lie that costs trust.
    expect(alert?.body).toContain("Nothing is being sold");
  });

  /*
   * The reason this function exists. A loan sits at 86% of the way to
   * liquidation for hours, not for a tick. A five-minute job that spoke every
   * time would send the same sentence a hundred times before lunch.
   */
  it("says nothing the second time, or the hundredth", () => {
    expect(alertFor("margin_call", at("margin_call"))).toBeNull();
    expect(alertFor("over_limit", at("over_limit"))).toBeNull();
    expect(alertFor("liquidation", at("liquidation"))).toBeNull();
  });

  it("speaks again when it gets worse", () => {
    expect(alertFor("over_limit", at("margin_call"))?.health).toBe("margin_call");
    expect(alertFor("margin_call", at("liquidation"))?.health).toBe("liquidation");
  });

  it("does not speak when it gets better but is still in trouble", () => {
    // Improving is not urgent, and every message that is not urgent makes the
    // urgent ones easier to ignore.
    expect(alertFor("liquidation", at("margin_call"))).toBeNull();
  });

  it("names the repayment that ends a margin call, because that is the action", () => {
    const alert = alertFor(null, at("margin_call"));
    expect(alert?.body).toContain("$340.00");
    expect(alert?.body).toContain("12%");
    expect(alert?.subject).toBe("Repay now, or your shares will be sold");
  });

  it("tells somebody being liquidated that it is happening now", () => {
    const alert = alertFor("margin_call", at("liquidation"));
    expect(alert?.title).toBe("Liquidation in progress");
    expect(alert?.body).toContain("happening now");
  });

  /* The feed's line is a label, like every row's; the mail beside it is the one written to somebody. */
  it("titles each warning in the feed as a label, not a sentence to somebody", () => {
    expect(alertFor(null, at("over_limit"))?.title).toBe("Loan over limit");
    expect(alertFor(null, at("margin_call"))?.title).toBe("Liquidation risk");
    expect(alertFor(null, at("liquidation"))?.title).toBe("Liquidation in progress");
  });

  it("copes with no cushion figure rather than printing an empty sentence", () => {
    const alert = alertFor(null, at("margin_call", { safeUntilDrop: null } as Partial<Input>));
    expect(alert?.body).toContain("very little room");
    expect(alert?.body).not.toContain("null");
  });
});

describe("markAfter", () => {
  it("remembers what was delivered, so it is not said twice", () => {
    expect(markAfter(null, "margin_call", true)).toBe("margin_call");
  });

  /*
   * Silence is not having told somebody. If the mark advanced on a failed
   * send, the one message that mattered would be the one never retried.
   */
  it("keeps the old mark when the message did not get through", () => {
    expect(markAfter("over_limit", "margin_call", false)).toBe("over_limit");
    expect(markAfter(null, "margin_call", false)).toBeNull();
  });

  it("clears the mark once the loan is healthy, so a relapse speaks again", () => {
    expect(markAfter("liquidation", "healthy", false)).toBe("healthy");
  });
});
