import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LATER_MS, refreshAfterChain } from "./settle";

/** The keys real queries are registered under. See api/hooks.ts and market/hooks.ts. */
const PORTFOLIO = ["api", "portfolio"];
const BASKET_RETURNS = ["api", "basket-returns"];
const QUOTE = ["quote", "NVDA", "100.00", "buy", false, false, true];

const matched = (qc: QueryClient, key: readonly unknown[]) =>
  qc.getQueryCache().find({ queryKey: key })?.state.isInvalidated === true;

describe("refreshAfterChain", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    qc = new QueryClient();
    for (const key of [PORTFOLIO, BASKET_RETURNS, QUOTE]) qc.setQueryData(key, {});
  });
  afterEach(() => vi.useRealTimers());

  /*
   * The bug this is here for: orders invalidated `["quotes"]` while the query
   * was registered as `["quote", …]`. Nothing type-checks a query key, so it
   * matched nothing for as long as it existed.
   */
  it("reaches a quote, which is priced against the wallet the transaction changed", () => {
    refreshAfterChain(qc);
    expect(matched(qc, QUOTE)).toBe(true);
  });

  it("reaches an account read that has no refetch interval of its own", () => {
    refreshAfterChain(qc);
    expect(matched(qc, BASKET_RETURNS)).toBe(true);
  });

  it("looks again after the chain, because a holding is written from finalized", () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    refreshAfterChain(qc);
    const immediately = invalidate.mock.calls.length;

    vi.advanceTimersByTime(Math.max(...LATER_MS) + 1);
    expect(invalidate.mock.calls.length).toBe(immediately * (LATER_MS.length + 1));
  });
});
