import { describe, expect, it } from "vitest";
import { GROUPS, toEvent } from "./index.js";
import type { ActivityItem } from "./activity-map.js";

const notice = {
  kind: "dividend_notice",
  occurredAt: "2026-11-25T12:00:00.000Z",
  title: "TSLA dividend coming",
  subtitle: "On Dec 3, 2026, paid as shares: about 0.0085 more on your 10",
  amountUsd: null,
  txSignature: null,
  mint: "TSLAx",
  logoUrl: null,
} as unknown as ActivityItem;

/** A dividend told before it lands: in the feed as a dividend, though nothing has moved yet. */
describe("a dividend coming, in the feed", () => {
  it("reads as a dividend, with its own words, no amount and no direction", () => {
    const e = toEvent(notice);
    expect([e.kind, e.title, e.flow, e.amount]).toEqual(["dividend", "TSLA dividend coming", null, null]);
  });

  it("is filed with income, where the dividend itself lands", () => {
    expect(GROUPS.find((g) => g.key === "income")?.kinds).toContain(toEvent(notice).kind);
  });

  it("shows a split with no amount and no direction: more shares, each worth less", () => {
    const e = toEvent({ ...notice, kind: "split", title: "TSLA stock split" } as unknown as ActivityItem);
    expect([e.title, e.flow, e.amount]).toEqual(["TSLA stock split", null, null]);
  });
});
