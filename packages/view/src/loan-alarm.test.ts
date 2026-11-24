import { describe, expect, it } from "vitest";
import type { PortfolioSummary } from "@mercury/types";
import type { Borrow } from "./borrow.js";
import { STAGES, alarmFor, fallUntil, otherAlarmLine, otherAlarms, pctOf } from "./loan-alarm.js";

const borrow = (over: Partial<Borrow>): Borrow =>
  ({
    debtUsd: 1500,
    health: "healthy",
    overTargetUsd: 0,
    repayToClearMarginCallUsd: 0,
    dropToMarginCall: 0.3,
    safeUntilDrop: 0.4,
    ...over,
  }) as Borrow;

describe("alarmFor", () => {
  it("says nothing about a healthy loan well clear of a margin call", () => {
    expect(alarmFor(borrow({ dropToMarginCall: 0.3 }))).toBeNull();
  });

  it("says nothing with no loan, however close the line", () => {
    expect(alarmFor(borrow({ debtUsd: 0, dropToMarginCall: 0.01 }))).toBeNull();
  });

  it("warns a healthy loan within 10% of a margin call, with the fall to it", () => {
    const a = alarmFor(borrow({ dropToMarginCall: 0.06 }));
    expect(a?.tone).toBe("warn");
    expect(a?.stage).toBe("healthy");
    expect(a?.title).toBe("Your loan is close to a margin call");
    expect(a?.next).toEqual({ stage: "margin_call", drop: 0.06 });
    expect(a?.repayUsd).toBeNull();
  });

  it("puts a margin call on the road with the fall to a sale and the repayment that stops it", () => {
    const a = alarmFor(
      borrow({
        health: "margin_call",
        safeUntilDrop: 0.09,
        repayToClearMarginCallUsd: 210,
        overTargetUsd: 340,
      }),
    );
    expect(a?.tone).toBe("down");
    expect(a?.stage).toBe("margin_call");
    expect(a?.title).toBe("Margin call on your loan");
    expect(a?.body).toBe(
      "Repay $210.00 to keep your shares from being sold. Repaying $340.00 also unlocks borrowing and withdrawals.",
    );
    expect(a?.next).toEqual({ stage: "liquidation", drop: 0.09 });
    expect(a?.repayUsd).toBe(210);
  });

  it("names a linked wallet's loan", () => {
    const a = alarmFor(borrow({ health: "margin_call", repayToClearMarginCallUsd: 1 }), "Phantom");
    expect(a?.title).toBe("Margin call on Phantom's loan");
    const over = alarmFor(borrow({ health: "over_limit", overTargetUsd: 5 }), "Phantom");
    expect(over?.title).toBe("Phantom's loan is past the 80% limit");
  });

  it("past the limit, points at the margin call ahead and repays the overage", () => {
    const a = alarmFor(borrow({ health: "over_limit", overTargetUsd: 120, dropToMarginCall: 0.05 }));
    expect(a?.tone).toBe("warn");
    expect(a?.next).toEqual({ stage: "margin_call", drop: 0.05 });
    expect(a?.repayUsd).toBe(120);
  });

  it("has no next stage once Kamino is selling", () => {
    const a = alarmFor(borrow({ health: "liquidation", repayToClearMarginCallUsd: 400 }));
    expect(a?.stage).toBe("liquidation");
    expect(a?.next).toBeNull();
    expect(a?.repayUsd).toBe(400);
  });

  it("leaves the distance off when the server could not work it out", () => {
    expect(alarmFor(borrow({ health: "margin_call", safeUntilDrop: null }))?.next).toBeNull();
    expect(alarmFor(borrow({ health: "over_limit", dropToMarginCall: null }))?.next).toBeNull();
  });

  it("puts no figure on the button when there is nothing to repay", () => {
    expect(alarmFor(borrow({ health: "margin_call", repayToClearMarginCallUsd: 0 }))?.repayUsd).toBeNull();
  });
});

describe("STAGES", () => {
  it("runs from healthy to a sale", () => {
    expect(STAGES).toEqual(["healthy", "over_limit", "margin_call", "liquidation"]);
  });
});

describe("pctOf", () => {
  it("rounds to a whole percent and never goes below zero", () => {
    expect(pctOf(0.094)).toBe("9%");
    expect(pctOf(-0.02)).toBe("0%");
  });
});

describe("otherAlarms", () => {
  const w = (
    id: string,
    loanHealth: PortfolioSummary["wallets"][number]["loanHealth"],
    isPrimary = false,
  ) => ({
    id,
    address: id,
    isPrimary,
    label: id,
    valueUsd: "1",
    asOf: null,
    debtUsd: "1",
    loanHealth,
    history: "ready" as const,
  });
  const name = (x: { label: string | null }) => x.label ?? "";

  it("lists loans in trouble in the wallets not being shown, worst first", () => {
    const out = otherAlarms(
      [
        w("m", "over_limit", true),
        w("p", "margin_call"),
        w("q", "healthy"),
        w("r", null),
        w("s", "liquidation"),
      ],
      null,
      name,
    );
    expect(out.map((a) => [a.id, a.health])).toEqual([
      ["s", "liquidation"],
      ["p", "margin_call"],
      ["m", "over_limit"],
    ]);
  });

  it("leaves out the wallet being shown, whose loan has its own alarm", () => {
    expect(otherAlarms([w("p", "margin_call")], "p", name)).toEqual([]);
  });
});

describe("otherAlarmLine", () => {
  it("says whose loan and how bad", () => {
    const base = { id: "p", name: "Phantom", isPrimary: false } as const;
    expect(otherAlarmLine({ ...base, health: "margin_call" })).toBe("Phantom's loan is in a margin call");
    expect(otherAlarmLine({ ...base, health: "liquidation" })).toBe("Phantom's loan is being liquidated");
    expect(otherAlarmLine({ ...base, health: "over_limit" })).toBe("Phantom's loan is past the 80% limit");
    expect(otherAlarmLine({ ...base, isPrimary: true, health: "margin_call" })).toBe(
      "Your Mercury wallet's loan is in a margin call",
    );
  });
});

describe("margin call wording", () => {
  it("says one amount once when it both stops a sale and unlocks the account", () => {
    const a = alarmFor(borrow({ health: "margin_call", repayToClearMarginCallUsd: 210, overTargetUsd: 210 }));
    expect(a?.body).toBe(
      "Repay $210.00 to keep your shares from being sold and unlock borrowing and withdrawals.",
    );
  });
});

describe("fallUntil", () => {
  it("names what the fall reaches, Kamino as a name", () => {
    expect(fallUntil({ stage: "liquidation", drop: 0.09 })).toBe("9% fall until Kamino sells");
    expect(fallUntil({ stage: "margin_call", drop: 0.05 })).toBe("5% fall until a margin call");
  });
});
