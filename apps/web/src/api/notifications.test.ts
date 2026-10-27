import { describe, expect, it } from "vitest";
import { badgeText, destinationOf, type Notification } from "./notifications";

const of = (kind: Notification["kind"]): Notification => ({
  id: "n1",
  kind,
  createdAt: "2026-10-27T11:00:00.000Z",
  readAt: null,
  activity: {
    id: "a1",
    kind: "transfer_in",
    occurredAt: "2026-10-27T10:59:00.000Z",
    title: "Added cash",
    subtitle: null,
    amountUsd: "250",
    txSignature: null,
    mint: null,
    logoUrl: null,
  },
});

describe("badgeText", () => {
  it("shows nothing at zero", () => expect(badgeText(0)).toBeNull());
  it("shows the count up to nine", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(9)).toBe("9");
  });
  it("caps above nine", () => expect(badgeText(10)).toBe("9+"));
});

describe("destinationOf", () => {
  it("opens the receipt for money in and dividends", () => {
    expect(destinationOf(of("money_in"))).toEqual({ receipt: "a1" });
    expect(destinationOf(of("dividend"))).toEqual({ receipt: "a1" });
  });
  it("goes to the portfolio for a loan warning", () => {
    expect(destinationOf(of("loan_alert"))).toEqual({ path: "/portfolio" });
  });
});
